import { assertNotNull, EvmBatchProcessor } from "@subsquid/evm-processor";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { CreditConsumption } from "./model";
import { UserCreditStats, HourlyCreditUsage, DailyCreditUsage } from "./model";
import { events } from "./abi/credits";

// TODO: Replace with actual contract.
const CREDITS_CONTRACT_ADDRESS = "0xb3f1d3e806cf2ec822ad32c01ad64a1995b67752"; // Amoy testnet contract address.
const RPC_ENDPOINT = process.env.RPC_ENDPOINT_POLYGON;

const GATEWAY =
  process.env.CHAIN_ID === "137"
    ? "https://v2.archive.subsquid.io/network/polygon-mainnet"
    : "https://v2.archive.subsquid.io/network/polygon-amoy-testnet";

// First we configure data retrieval.
const processor = new EvmBatchProcessor()
  .setGateway(GATEWAY)
  .setRpcEndpoint({
    url: assertNotNull(RPC_ENDPOINT),
    rateLimit: 10,
  })
  .setFinalityConfirmation(75)
  .setBlockRange({ from: 17942200 })
  .setFields({
    log: {
      transactionHash: true,
    },
  })
  .addLog({
    address: [CREDITS_CONTRACT_ADDRESS],
    topic0: [events.CreditSpent.topic],
  });

const db = new TypeormDatabase();

processor.run(db, async (ctx) => {
  console.log("Processing new batch of blocks...");
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
        log.topics[0] === events.CreditSpent.topic
      ) {
        console.log("🎯 Found CreditSpent event!");

        const { _creditId, beneficiary, amount } =
          events.CreditSpent.decode(log);
        console.log({
          event: "CreditSpent",
          creditId: _creditId,
          beneficiary,
          amount: amount.toString(),
          blockNumber: block.header.height,
          txHash: log.transactionHash,
        });

        const timestamp = new Date(block.header.timestamp);

        // Get or create UserCreditStats
        let userStat = userStats.get(beneficiary);
        if (!userStat) {
          const existingStats = await ctx.store.get(
            UserCreditStats,
            beneficiary
          );
          console.log(
            existingStats
              ? `Found existing stats for user ${beneficiary}`
              : `Creating new stats for user ${beneficiary}`
          );

          userStat =
            existingStats ||
            new UserCreditStats({
              id: beneficiary,
              address: beneficiary,
              totalCreditsConsumed: 0n,
            });
          userStats.set(beneficiary, userStat);
        }

        const oldTotal = userStat.totalCreditsConsumed;
        userStat.totalCreditsConsumed += amount;
        userStat.lastCreditUsage = timestamp;

        console.log(`Updated user stats:`, {
          user: beneficiary,
          oldTotal: oldTotal.toString(),
          newTotal: userStat.totalCreditsConsumed.toString(),
          lastUsage: userStat.lastCreditUsage,
        });

        // Create credit consumption record
        const consumption = new CreditConsumption({
          id: log.id,
          creditId: _creditId,
          beneficiary: userStat,
          amount,
          timestamp,
          block: block.header.height,
          txHash: log.transactionHash,
        });
        consumptions.push(consumption);
        console.log("Created consumption record:", {
          id: consumption.id,
          amount: consumption.amount.toString(),
          block: consumption.block,
        });

        // Update hourly usage
        const hourKey = `${timestamp.getUTCFullYear()}-${timestamp.getUTCMonth()}-${timestamp.getUTCDate()}-${timestamp.getUTCHours()}`;
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
        hourUsage.totalAmount += amount;
        hourUsage.usageCount += 1;
        hourlyUsage.set(hourKey, hourUsage);
        console.log("Updated hourly stats:", {
          hour: hourKey,
          totalAmount: hourUsage.totalAmount.toString(),
          usageCount: hourUsage.usageCount,
        });

        // Update daily usage
        const dayKey = `${timestamp.getUTCFullYear()}-${timestamp.getUTCMonth()}-${timestamp.getUTCDate()}`;
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
        dayUsage.totalAmount += amount;
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
              `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}` ===
              dayKey
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

    await ctx.store.save([...userStats.values()]);
    await ctx.store.save([...hourlyUsage.values()]);
    await ctx.store.save([...dailyUsage.values()]);
    await ctx.store.save(consumptions);

    console.log("Batch processing complete! ✨\n");
  }
});
