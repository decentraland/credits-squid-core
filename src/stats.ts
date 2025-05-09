import { Store } from "@subsquid/typeorm-store";
import {
  CreditConsumption,
  UserCreditStats,
  HourlyCreditUsage,
  DailyCreditUsage,
} from "./model";

/**
 * Creates or updates user credit stats
 */
export async function updateUserStats(
  store: Store,
  userStats: Map<string, UserCreditStats>,
  address: string,
  amount: bigint,
  timestamp: Date
): Promise<UserCreditStats> {
  let userStat = userStats.get(address);
  
  if (!userStat) {
    const existingStats = await store.get(UserCreditStats, address);
    console.log(
      existingStats
        ? `Found existing stats for user ${address}`
        : `Creating new stats for user ${address}`
    );

    userStat =
      existingStats ||
      new UserCreditStats({
        id: address,
        address: address,
        totalCreditsConsumed: 0n,
      });
    userStats.set(address, userStat);
  }

  const oldTotal = userStat.totalCreditsConsumed;
  userStat.totalCreditsConsumed += amount;
  userStat.lastCreditUsage = timestamp;

  console.log(`Updated user stats:`, {
    user: address,
    oldTotal: oldTotal.toString(),
    newTotal: userStat.totalCreditsConsumed.toString(),
    lastUsage: userStat.lastCreditUsage,
  });

  return userStat;
}

/**
 * Formats a date as YYYY-MM-DD
 */
export function formatDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Formats a date as YYYY-MM-DD-HH
 */
export function formatHourKey(date: Date): string {
  return `${formatDateKey(date)}-${String(date.getUTCHours()).padStart(2, "0")}`;
}

/**
 * Updates hourly credit usage statistics
 */
export async function updateHourlyStats(
  store: Store,
  hourlyUsage: Map<string, HourlyCreditUsage>,
  timestamp: Date,
  amount: bigint
): Promise<HourlyCreditUsage> {
  const hourKey = formatHourKey(timestamp);
  console.log(`Processing hourly stats for key ${hourKey}`);
  
  let hourUsage = hourlyUsage.get(hourKey);
  if (!hourUsage) {
    console.log(`No in-memory hourly stats for ${hourKey}, checking database...`);
    const existingHourUsage = await store.get(HourlyCreditUsage, hourKey);
    
    if (existingHourUsage) {
      console.log(
        `Found existing hourly stats in DB: ${JSON.stringify({
          id: existingHourUsage.id,
          totalAmount: existingHourUsage.totalAmount.toString(),
          usageCount: existingHourUsage.usageCount,
        })}`
      );
    } else {
      console.log(`No hourly stats in DB for ${hourKey}, creating new entry`);
    }
    
    hourUsage =
      existingHourUsage ||
      new HourlyCreditUsage({
        id: hourKey,
        totalAmount: 0n,
        usageCount: 0,
        timestamp,
      });
  } else {
    console.log(
      `Using in-memory hourly stats for ${hourKey}: ${JSON.stringify({
        totalAmount: hourUsage.totalAmount.toString(),
        usageCount: hourUsage.usageCount,
      })}`
    );
  }
  
  const prevHourAmount = hourUsage.totalAmount;
  const prevHourCount = hourUsage.usageCount;
  
  hourUsage.totalAmount += amount;
  hourUsage.usageCount += 1;
  hourlyUsage.set(hourKey, hourUsage);
  
  console.log(
    `Updated hourly stats: ${hourKey}: ${JSON.stringify({
      prevAmount: prevHourAmount.toString(),
      newAmount: hourUsage.totalAmount.toString(),
      prevCount: prevHourCount,
      newCount: hourUsage.usageCount,
    })}`
  );
  
  return hourUsage;
}

/**
 * Updates daily credit usage statistics
 */
export async function updateDailyStats(
  store: Store,
  dailyUsage: Map<string, DailyCreditUsage>,
  timestamp: Date,
  amount: bigint
): Promise<DailyCreditUsage> {
  const dayKey = formatDateKey(timestamp);
  console.log(`Processing daily stats for key ${dayKey}`);
  
  let dayUsage = dailyUsage.get(dayKey);
  if (!dayUsage) {
    console.log(`No in-memory daily stats for ${dayKey}, checking database...`);
    const existingDayUsage = await store.get(DailyCreditUsage, dayKey);
    
    if (existingDayUsage) {
      console.log(
        `Found existing daily stats in DB: ${JSON.stringify({
          id: existingDayUsage.id,
          totalAmount: existingDayUsage.totalAmount.toString(),
          usageCount: existingDayUsage.usageCount,
          uniqueUsers: existingDayUsage.uniqueUsers,
        })}`
      );
    } else {
      console.log(`No daily stats in DB for ${dayKey}, creating new entry`);
    }
    
    dayUsage =
      existingDayUsage ||
      new DailyCreditUsage({
        id: dayKey,
        totalAmount: 0n,
        uniqueUsers: 0,
        usageCount: 0,
        timestamp,
      });
  } else {
    console.log(
      `Using in-memory daily stats for ${dayKey}: ${JSON.stringify({
        totalAmount: dayUsage.totalAmount.toString(),
        usageCount: dayUsage.usageCount,
        uniqueUsers: dayUsage.uniqueUsers,
      })}`
    );
  }
  
  const prevDayAmount = dayUsage.totalAmount;
  const prevDayCount = dayUsage.usageCount;
  
  dayUsage.totalAmount += amount;
  dayUsage.usageCount += 1;
  dailyUsage.set(dayKey, dayUsage);
  
  console.log(
    `Updated daily stats: ${dayKey}: ${JSON.stringify({
      prevAmount: prevDayAmount.toString(),
      newAmount: dayUsage.totalAmount.toString(),
      prevCount: prevDayCount,
      newCount: dayUsage.usageCount,
    })}`
  );
  
  return dayUsage;
}

/**
 * Updates unique users count for daily statistics
 */
export function updateUniqueUserCounts(
  dailyUsage: Map<string, DailyCreditUsage>,
  consumptions: CreditConsumption[]
): void {
  if (dailyUsage.size === 0) return;
  
  console.log("\nUpdating daily unique users counts...");
  
  for (let [dayKey, usage] of dailyUsage) {
    console.log(`Calculating unique users for day ${dayKey}`);
    
    const matchingConsumptions = consumptions.filter((c) => {
      const d = c.timestamp;
      const consumptionDayKey = formatDateKey(d);
      
      const matches = consumptionDayKey === dayKey;
      if (matches) {
        console.log(`Matched consumption ${c.id} to day ${dayKey}`);
      }
      return matches;
    });
    
    console.log(`Found ${matchingConsumptions.length} consumptions for day ${dayKey}`);
    
    const userIds = matchingConsumptions.map((c) => c.beneficiary.id);
    console.log(`User IDs for day ${dayKey}: ${userIds.join(", ")}`);
    
    const uniqueUsers = new Set(userIds);
    usage.uniqueUsers = uniqueUsers.size;
    
    console.log(
      `Day ${dayKey}: ${usage.uniqueUsers} unique users (${Array.from(uniqueUsers).join(", ")})`
    );
  }
}

/**
 * Filters out duplicate consumption records before saving
 */
export function getUniqueConsumptions(consumptions: CreditConsumption[]): CreditConsumption[] {
  const consumptionIds = new Set<string>();
  const uniqueConsumptions = consumptions.filter((c) => {
    if (consumptionIds.has(c.id)) {
      console.log(`WARNING: Removing duplicate consumption record with ID ${c.id} before saving`);
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
  
  return uniqueConsumptions;
}

/**
 * Debugs entities to be saved
 */
export function logEntitiesToSave(
  userStats: Map<string, UserCreditStats>,
  hourlyUsage: Map<string, HourlyCreditUsage>,
  dailyUsage: Map<string, DailyCreditUsage>,
  consumptions: CreditConsumption[]
): void {
  console.log("\nSaving entities to database...");
  console.log(`- ${userStats.size} user stats`);
  console.log(`- ${hourlyUsage.size} hourly records`);
  console.log(`- ${dailyUsage.size} daily records`);
  console.log(`- ${consumptions.length} consumption records`);
  
  // Debug hourly usage entities
  console.log("\nDEBUG: Hourly usage records to save:");
  for (const [key, usage] of hourlyUsage.entries()) {
    console.log(
      `  - Hour ${key}: amount=${usage.totalAmount.toString()}, count=${
        usage.usageCount
      }`
    );
  }
  
  // Debug daily usage entities
  console.log("\nDEBUG: Daily usage records to save:");
  for (const [key, usage] of dailyUsage.entries()) {
    console.log(
      `  - Day ${key}: amount=${usage.totalAmount.toString()}, count=${
        usage.usageCount
      }, uniqueUsers=${usage.uniqueUsers}`
    );
  }
} 