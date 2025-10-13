import { assertNotNull, EvmBatchProcessor, Log } from "@subsquid/evm-processor";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { CreditConsumption } from "./model";
import { UserCreditStats, HourlyCreditUsage, DailyCreditUsage } from "./model";
import { events as CreditsEvents } from "./abi/credits";
import { events as ERC20Events } from "./abi/erc20";
import {
  createSlackComponent,
  getCreditUsedMessage,
  getLastNotified,
  ISlackComponent,
  setLastNotified,
} from "./slack";
import {
  updateUserStats,
  updateHourlyStats,
  updateDailyStats,
  updateUniqueUserCounts,
  logEntitiesToSave,
} from "./stats";
import { findManaTransfersInBlock, createManaTransactions } from "./mana";
import { formatMana } from "./utils";
import { ManaTransfer } from "./types";

const schemaName = process.env.DB_SCHEMA;
const RPC_ENDPOINT = process.env.RPC_ENDPOINT_POLYGON;
const PROMETHEUS_PORT = process.env.PROMETHEUS_PORT || 3001;
const isMainnet = process.env.POLYGON_CHAIN_ID === "137";

const SLACK_NOTIFICATIONS_CHANNEL = isMainnet
  ? "credits-notifications"
  : "credits-notifications-dev";

export const MANA_CONTRACT_ADDRESS = isMainnet
  ? "0xa1c57f48f0deb89f569dfbe6e2b7f46d33606fd4"
  : "0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0";

// DAO address that receives fees
export const DAO_ADDRESS = "0xb08e3e7cc815213304d884c88ca476ebc50eaab2";

export const CREDITS_CONTRACT_ADDRESS = isMainnet
  ? "0xe9f961e6ded4e1476bbee4faab886d63a2493eb9"
  : "0x037566bc90f85e76587e1b07f9184585f09c1420";

const GATEWAY = isMainnet
  ? "https://v2.archive.subsquid.io/network/polygon-mainnet"
  : "https://v2.archive.subsquid.io/network/polygon-amoy-testnet";

const FROM_BLOCK = isMainnet ? 70459461 : 20612932;

const FINALITY_CONFIRMATION = parseInt(
  process.env.FINALITY_CONFIRMATION_POLYGON || "75"
);

// Initialize Slack component
let slackComponent: ISlackComponent | undefined;

async function initSlack() {
  try {
    if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET) {
      slackComponent = await createSlackComponent({
        botToken: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
      });
      console.log("[SLACK] Component initialized successfully");
    } else {
      console.log("[SLACK] Credentials not provided, notifications disabled");
    }
  } catch (error) {
    console.error("[SLACK] ERROR: Failed to initialize component:", error);
  }
}

const processor = new EvmBatchProcessor()
  .setGateway(GATEWAY)
  .setRpcEndpoint({
    url: assertNotNull(RPC_ENDPOINT),
    rateLimit: 10,
  })
  .setPrometheusPort(PROMETHEUS_PORT)
  .setFinalityConfirmation(FINALITY_CONFIRMATION)
  .setBlockRange({ from: FROM_BLOCK })
  .setFields({
    log: {
      transactionHash: true,
    },
  })
  .addLog({
    address: [MANA_CONTRACT_ADDRESS],
    topic0: [ERC20Events.Transfer.topic],
  })
  .addLog({
    address: [CREDITS_CONTRACT_ADDRESS],
    topic0: [CreditsEvents.CreditUsed.topic],
  });

const db = new TypeormDatabase({
  isolationLevel: "READ COMMITTED",
  supportHotBlocks: true,
  stateSchema: `${schemaName}_processor`,
});

// Initialize Slack before running the processor
initSlack()
  .then(() => {
    processor.run(db, async (ctx) => {
      console.log(
        `[PROCESSOR] Batch range: ${ctx.blocks[0]?.header.height} -> ${
          ctx.blocks[ctx.blocks.length - 1]?.header.height
        }`
      );

      const consumptions: CreditConsumption[] = [];
      const userStats = new Map<string, UserCreditStats>();
      const hourlyUsage = new Map<string, HourlyCreditUsage>();
      const dailyUsage = new Map<string, DailyCreditUsage>();

      // Store MANA transfers and credit consumptions by transaction hash
      const manaTransfersByTx = new Map<string, ManaTransfer[]>();
      const creditConsumptionsByTx = new Map<string, CreditConsumption[]>();

      for (let block of ctx.blocks) {
        // Create a map of txHash -> logs for this block to efficiently find MANA transfers
        const logsByTxHash = new Map<
          string,
          (Log & { transactionHash: string })[]
        >();

        // Process logs first to build the txHash map and find MANA transfers
        for (let log of block.logs) {
          const txHash =
            log.transactionHash ||
            `unknown-${block.header.height}-${log.logIndex}`;

          // Add log to the txHash map
          if (!logsByTxHash.has(txHash)) {
            logsByTxHash.set(txHash, []);
          }
          logsByTxHash
            .get(txHash)!
            .push(log as Log & { transactionHash: string });
        }

        // Find all MANA transfers in this block upfront
        const timestamp = new Date(block.header.timestamp);
        for (const [txHash, logs] of logsByTxHash.entries()) {
          const transfers = findManaTransfersInBlock(
            logs,
            timestamp,
            block.header.height
          );

          if (transfers.length > 0) {
            if (!manaTransfersByTx.has(txHash)) {
              manaTransfersByTx.set(txHash, []);
            }

            // Add these transfers to our map
            manaTransfersByTx.set(txHash, [
              ...(manaTransfersByTx.get(txHash) || []),
              ...transfers,
            ]);
          }
        }

        // Now process credit usage events
        for (let log of block.logs) {
          // Process Credit Usage events
          if (
            log.address === CREDITS_CONTRACT_ADDRESS &&
            log.topics[0] === CreditsEvents.CreditUsed.topic
          ) {
            const {
              _sender,
              _value,
              _credit: { salt },
            } = CreditsEvents.CreditUsed.decode(log);

            const txHash =
              log.transactionHash ||
              `unknown-${block.header.height}-${log.logIndex}`;

            // Format MANA value for logs
            const formattedMana = formatMana(_value);

            // Create a unique consumptionId that includes tx details
            const consumptionId = `${salt}-${block.header.height}-${txHash}`;

            // Check if this specific consumption already exists in database
            const existingConsumption = await ctx.store.get(
              CreditConsumption,
              consumptionId
            );

            if (existingConsumption) {
              console.log(
                `[CREDITS] ⚠️ Consumption ${consumptionId} already exists, skipping`
              );
              continue;
            }

            console.log(
              `[CREDITS] 💸 Used: id=${salt}, sender=${_sender}, amount=${formattedMana}`
            );

            const timestamp = new Date(block.header.timestamp);

            // Get or update user stats
            const userStat = await updateUserStats(
              ctx.store,
              userStats,
              _sender,
              _value,
              timestamp
            );

            // Create credit consumption record
            const consumption = new CreditConsumption({
              id: consumptionId,
              creditId: salt,
              contract: log.address,
              beneficiary: userStat,
              amount: _value,
              timestamp,
              block: block.header.height,
              txHash,
            });

            consumptions.push(consumption);

            // Add to consumptions by txHash map
            if (!creditConsumptionsByTx.has(txHash)) {
              creditConsumptionsByTx.set(txHash, []);
            }
            creditConsumptionsByTx.get(txHash)!.push(consumption);

            // Send Slack notification for real-time consumption events
            if (slackComponent) {
              try {
                const lastNotified = await getLastNotified(ctx.store);
                if (lastNotified && lastNotified > block.header.height) {
                  // Skip unnecessary log
                  continue;
                }
                await slackComponent.sendMessage(
                  SLACK_NOTIFICATIONS_CHANNEL,
                  getCreditUsedMessage(
                    salt,
                    _sender,
                    _value,
                    block.header.height,
                    txHash,
                    timestamp
                  )
                );
                await setLastNotified(ctx.store, BigInt(block.header.height));
                console.log(
                  `[SLACK] ✅ Sent notification for consumption ${salt}`
                );
              } catch (error) {
                console.error(
                  `[SLACK] ERROR: ⛔ Failed to send notification:`,
                  error
                );
              }
            }

            // Update hourly usage stats
            await updateHourlyStats(ctx.store, hourlyUsage, timestamp, _value);

            // Update daily usage stats
            await updateDailyStats(ctx.store, dailyUsage, timestamp, _value);
          }
        }
      }

      // Update unique users count for daily usage
      updateUniqueUserCounts(dailyUsage, consumptions);

      // Create mana transactions from transfers and consumptions
      const manaTransactions = createManaTransactions(
        manaTransfersByTx,
        creditConsumptionsByTx,
        ctx.store
      );

      // Skip detailed entity logging unless in debug mode
      logEntitiesToSave(userStats, hourlyUsage, dailyUsage, consumptions);

      // Get unique consumptions (removing any duplicates)
      const uniqueConsumptions = Array.from(
        new Map(consumptions.map((c: CreditConsumption) => [c.id, c])).values()
      );

      // Save all entities to database
      await ctx.store.save([...userStats.values()]);
      await ctx.store.save([...hourlyUsage.values()]);
      await ctx.store.save([...dailyUsage.values()]);
      await ctx.store.save(uniqueConsumptions);
      await ctx.store.save(manaTransactions);

      // Only log batch completion if something was processed
      const totalEntities =
        userStats.size + uniqueConsumptions.length + manaTransactions.length;
      if (totalEntities > 0) {
        console.log(
          `[PROCESSOR] ✅ Batch complete: ${uniqueConsumptions.length} consumptions, ${userStats.size} users, ${manaTransactions.length} MANA transactions`
        );
      }
    });
  })
  .catch((err) => {
    console.error("[PROCESSOR] ERROR: Failed to start processor:", err);
    process.exit(1);
  });
