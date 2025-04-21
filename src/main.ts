import { assertNotNull, EvmBatchProcessor } from "@subsquid/evm-processor";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { CreditConsumption } from "./model";
import { UserCreditStats, HourlyCreditUsage, DailyCreditUsage } from "./model";
import { events } from "./abi/credits";
import {
  createSlackComponent,
  getCreditUsedMessage,
  getLastNotified,
  ISlackComponent,
  setLastNotified,
} from "./slack";

// TODO: Replace with actual contract.
const isMainnet = process.env.POLYGON_CHAIN_ID === "137";

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
  .setBlockRange({ from: 17942200 })
  .setFields({
    log: {
      transactionHash: true,
    },
  })
  .addLog({
    address: [CREDITS_CONTRACT_ADDRESS],
    topic0: [events.CreditUsed.topic],
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
            log.topics[0] === events.CreditUsed.topic
          ) {
            const {
              _sender,
              _value,
              _credit: { salt },
            } = events.CreditUsed.decode(log);

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

            // Get or create UserCreditStats
            let userStat = userStats.get(_sender);
            if (!userStat) {
              const existingStats = await ctx.store.get(
                UserCreditStats,
                _sender
              );
              console.log(
                existingStats
                  ? `Found existing stats for user ${_sender}`
                  : `Creating new stats for user ${_sender}`
              );

              userStat =
                existingStats ||
                new UserCreditStats({
                  id: _sender,
                  address: _sender,
                  totalCreditsConsumed: 0n,
                });
              userStats.set(_sender, userStat);
            }

            const oldTotal = userStat.totalCreditsConsumed;
            userStat.totalCreditsConsumed += _value;
            userStat.lastCreditUsage = timestamp;

            console.log(`Updated user stats:`, {
              user: _sender,
              oldTotal: oldTotal.toString(),
              newTotal: userStat.totalCreditsConsumed.toString(),
              lastUsage: userStat.lastCreditUsage,
            });

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
            if (ctx.isHead && slackComponent) {
              try {
                const lastNotified = await getLastNotified(ctx.store);
                if (lastNotified && lastNotified >= block.header.height) {
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

            // Update hourly usage
            const hourKey = `${timestamp.getUTCFullYear()}-${String(
              timestamp.getUTCMonth() + 1
            ).padStart(2, "0")}-${String(timestamp.getUTCDate()).padStart(
              2,
              "0"
            )}-${String(timestamp.getUTCHours()).padStart(2, "0")}`;
            let hourUsage = hourlyUsage.get(hourKey);
            if (!hourUsage) {
              hourUsage =
                (await ctx.store.get(HourlyCreditUsage, hourKey)) ||
                new HourlyCreditUsage({
                  id: hourKey,
                  totalAmount: 0n,
                  usageCount: 0,
                  timestamp,
                });
            }
            hourUsage.totalAmount += _value;
            hourUsage.usageCount += 1;
            hourlyUsage.set(hourKey, hourUsage);
            console.log("Updated hourly stats:", {
              hour: hourKey,
              totalAmount: hourUsage.totalAmount.toString(),
              usageCount: hourUsage.usageCount,
            });

            // Update daily usage
            const dayKey = `${timestamp.getUTCFullYear()}-${String(
              timestamp.getUTCMonth() + 1
            ).padStart(2, "0")}-${String(timestamp.getUTCDate()).padStart(
              2,
              "0"
            )}`;
            let dayUsage = dailyUsage.get(dayKey);
            if (!dayUsage) {
              dayUsage =
                (await ctx.store.get(DailyCreditUsage, dayKey)) ||
                new DailyCreditUsage({
                  id: dayKey,
                  totalAmount: 0n,
                  uniqueUsers: 0,
                  usageCount: 0,
                  timestamp,
                });
            }
            dayUsage.totalAmount += _value;
            dayUsage.usageCount += 1;
            dailyUsage.set(dayKey, dayUsage);
            console.log("Updated daily stats:", {
              day: dayKey,
              totalAmount: dayUsage.totalAmount.toString(),
              usageCount: dayUsage.usageCount,
            });
          }
        }
      }

      // Only log unique users if we have any daily usage
      if (dailyUsage.size > 0) {
        console.log("\nUpdating daily unique users counts...");
        for (let [dayKey, usage] of dailyUsage) {
          const uniqueUsers = new Set(
            consumptions
              .filter((c) => {
                const d = c.timestamp;
                return (
                  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
                    2,
                    "0"
                  )}-${String(d.getUTCDate()).padStart(2, "0")}` === dayKey
                );
              })
              .map((c) => c.beneficiary.id)
          );
          usage.uniqueUsers = uniqueUsers.size;
          console.log(`Day ${dayKey}: ${usage.uniqueUsers} unique users`);
        }
      }

      // Only log and save if we have entities to save
      const hasEntities =
        userStats.size > 0 ||
        hourlyUsage.size > 0 ||
        dailyUsage.size > 0 ||
        consumptions.length > 0;

      if (hasEntities) {
        console.log("\nSaving entities to database...");
        console.log(`- ${userStats.size} user stats`);
        console.log(`- ${hourlyUsage.size} hourly records`);
        console.log(`- ${dailyUsage.size} daily records`);
        console.log(`- ${consumptions.length} consumption records`);

        // Final check for duplicate consumption records
        const consumptionIds = new Set<string>();
        const uniqueConsumptions = consumptions.filter((c) => {
          if (consumptionIds.has(c.id)) {
            console.log(
              `WARNING: Removing duplicate consumption record with ID ${c.id} before saving`
            );
            return false;
          }
          consumptionIds.add(c.id);
          return true;
        });

        if (uniqueConsumptions.length !== consumptions.length) {
          console.log(
            `WARNING: Removed ${
              consumptions.length - uniqueConsumptions.length
            } duplicate consumption records`
          );
        }

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
