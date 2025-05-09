import { assertNotNull, EvmBatchProcessor } from "@subsquid/evm-processor";
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
  getUniqueConsumptions,
  logEntitiesToSave,
} from "./stats";

const isMainnet = process.env.POLYGON_CHAIN_ID === "137";

const MANA_CONTRACT_ADDRESS = isMainnet
  ? "0xa1c57f48f0deb89f569dfbe6e2b7f46d33606fd4"
  : "0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0";

const CREDITS_CONTRACT_ADDRESS = isMainnet
  ? "0x6a03991dfa9d661ef7ad3c6f88b31f16e5a282cf"
  : "0x1985fa82b531cb4e20f103787eba99de67b5c25c";
const RPC_ENDPOINT = process.env.RPC_ENDPOINT_POLYGON;
const PROMETHEUS_PORT = process.env.PROMETHEUS_PORT || 3001;
const SLACK_NOTIFICATIONS_CHANNEL = isMainnet
  ? "credits-notifications"
  : "credits-notifications-dev";

const GATEWAY = isMainnet
  ? "https://v2.archive.subsquid.io/network/polygon-mainnet"
  : "https://v2.archive.subsquid.io/network/polygon-amoy-testnet";

const FROM_BLOCK = isMainnet ? 70459461 : 20612932;
// Initialize Slack component
let slackComponent: ISlackComponent | undefined;

async function initSlack() {
  try {
    if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET) {
      slackComponent = await createSlackComponent({
        botToken: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
      });
      console.log("Slack component initialized successfully");
    } else {
      console.log("Slack credentials not provided, notifications disabled");
    }
  } catch (error) {
    console.error("Failed to initialize Slack component:", error);
  }
}

const processor = new EvmBatchProcessor()
  .setGateway(GATEWAY)
  .setRpcEndpoint({
    url: assertNotNull(RPC_ENDPOINT),
    rateLimit: 10,
  })
  .setPrometheusPort(PROMETHEUS_PORT)
  .setFinalityConfirmation(75)
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

const schemaName = process.env.DB_SCHEMA;

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
        `Batch range: ${ctx.blocks[0]?.header.height} -> ${
          ctx.blocks[ctx.blocks.length - 1]?.header.height
        }`
      );

      const consumptions: CreditConsumption[] = [];
      const userStats = new Map<string, UserCreditStats>();
      const hourlyUsage = new Map<string, HourlyCreditUsage>();
      const dailyUsage = new Map<string, DailyCreditUsage>();

      for (let block of ctx.blocks) {
        for (let log of block.logs) {
          if (
            log.address === CREDITS_CONTRACT_ADDRESS &&
            log.topics[0] === CreditsEvents.CreditUsed.topic
          ) {
            const {
              _sender,
              _value,
              _credit: { salt },
            } = CreditsEvents.CreditUsed.decode(log);

            console.log({
              event: "CreditUsed",
              creditId: salt,
              beneficiary: _sender,
              amount: _value.toString(),
              blockNumber: block.header.height,
              txHash: log.transactionHash,
            });

            // Create a unique consumptionId that includes tx details to allow multiple consumptions of the same credit
            const consumptionId = `${salt}-${block.header.height}-${log.transactionHash}`;

            // Check if this specific consumption already exists in database
            const existingConsumption = await ctx.store.get(
              CreditConsumption,
              consumptionId
            );
            if (existingConsumption) {
              console.log(
                `Consumption record with ID ${consumptionId} already exists in database, skipping event processing`
              );
              continue;
            }

            const timestamp = new Date(block.header.timestamp);

            // Get or update user stats
            const userStat = await updateUserStats(
              ctx.store,
              userStats,
              _sender,
              _value,
              timestamp
            );

            // Create credit consumption record with the unique ID
            const consumption = new CreditConsumption({
              id: consumptionId,
              creditId: salt,
              contract: log.address,
              beneficiary: userStat,
              amount: _value,
              timestamp,
              block: block.header.height,
              txHash: log.transactionHash,
            });
            consumptions.push(consumption);
            console.log("Created consumption record:", {
              id: consumption.id,
              creditId: salt,
              amount: consumption.amount.toString(),
              block: consumption.block,
            });

            // Send Slack notification for real-time consumption events (ctx.isHead)
            if (slackComponent) {
              try {
                const lastNotified = await getLastNotified(ctx.store);
                if (lastNotified && lastNotified > block.header.height) {
                  console.log(
                    `Skipping notification for block ${block.header.height} because it was already notified`
                  );
                  continue;
                }
                await slackComponent.sendMessage(
                  SLACK_NOTIFICATIONS_CHANNEL,
                  getCreditUsedMessage(
                    salt,
                    _sender,
                    _value,
                    block.header.height,
                    log.transactionHash,
                    timestamp
                  )
                );
                await setLastNotified(ctx.store, BigInt(block.header.height));
                console.log(
                  `Sent Slack notification for consumption ${consumptionId}`
                );
              } catch (error) {
                console.error(`Failed to send Slack notification:`, error);
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

      // Only log and save if we have entities to save
      const hasEntities =
        userStats.size > 0 ||
        hourlyUsage.size > 0 ||
        dailyUsage.size > 0 ||
        consumptions.length > 0;

      if (hasEntities) {
        // Log detailed entity information
        logEntitiesToSave(userStats, hourlyUsage, dailyUsage, consumptions);

        // Get unique consumptions (removing any duplicates)
        const uniqueConsumptions = getUniqueConsumptions(consumptions);

        await ctx.store.save([...userStats.values()]);
        await ctx.store.save([...hourlyUsage.values()]);
        await ctx.store.save([...dailyUsage.values()]);
        await ctx.store.save(uniqueConsumptions);

        console.log("Batch processing complete! ✨\n");
      }
    });
  })
  .catch((err) => {
    console.error("Failed to start processor:", err);
    process.exit(1);
  });
