import { Store } from "@subsquid/typeorm-store";
import {
  CreditConsumption,
  UserCreditStats,
  HourlyCreditUsage,
  DailyCreditUsage,
} from "./model";
import { formatMana } from "./utils";

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

    // Only log if it's a new user
    if (!existingStats) {
      console.log(
        `[STATS] New user ${address} consuming ${formatMana(amount)}`
      );
    }

    userStat =
      existingStats ||
      new UserCreditStats({
        id: address,
        address: address,
        totalCreditsConsumed: 0n,
      });
    userStats.set(address, userStat);
  }

  userStat.totalCreditsConsumed += amount;
  userStat.lastCreditUsage = timestamp;

  return userStat;
}

/**
 * Formats a date as YYYY-MM-DD
 */
export function formatDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Formats a date as YYYY-MM-DD-HH
 */
export function formatHourKey(date: Date): string {
  return `${formatDateKey(date)}-${String(date.getUTCHours()).padStart(
    2,
    "0"
  )}`;
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

  let hourUsage = hourlyUsage.get(hourKey);
  if (!hourUsage) {
    const existingHourUsage = await store.get(HourlyCreditUsage, hourKey);

    hourUsage =
      existingHourUsage ||
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

  let dayUsage = dailyUsage.get(dayKey);
  if (!dayUsage) {
    const existingDayUsage = await store.get(DailyCreditUsage, dayKey);

    dayUsage =
      existingDayUsage ||
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

  for (let [dayKey, usage] of dailyUsage) {
    const matchingConsumptions = consumptions.filter((c) => {
      const d = c.timestamp;
      const consumptionDayKey = formatDateKey(d);
      return consumptionDayKey === dayKey;
    });

    const userIds = matchingConsumptions.map((c) => c.beneficiary.id);
    const uniqueUsers = new Set(userIds);
    usage.uniqueUsers = uniqueUsers.size;

    // Only log significant days with multiple users and only first 6 characters of the day key
    if (usage.uniqueUsers > 10) {
      console.log(
        `[STATS] ${dayKey}: ${usage.uniqueUsers} users, ${formatMana(
          usage.totalAmount
        )} total`
      );
    }
  }
}

/**
 * Logs detailed information about entities to be saved
 */
export function logEntitiesToSave(
  userStats: Map<string, UserCreditStats>,
  hourlyUsage: Map<string, HourlyCreditUsage>,
  dailyUsage: Map<string, DailyCreditUsage>,
  consumptions: CreditConsumption[]
): void {
  if (
    userStats.size === 0 &&
    hourlyUsage.size === 0 &&
    dailyUsage.size === 0 &&
    consumptions.length === 0
  ) {
    return;
  }

  const totalMana = consumptions.reduce((sum, c) => sum + c.amount, 0n);

  // Log a condensed summary
  console.log(
    `[STATS] 📊 ${userStats.size} users | ${
      consumptions.length
    } consumptions | ${formatMana(totalMana)} MANA`
  );

  // Only log detailed user stats for significant batches with many users
  if (userStats.size > 10) {
    const topUsers = Array.from(userStats.values())
      .sort((a, b) => Number(b.totalCreditsConsumed - a.totalCreditsConsumed))
      .slice(0, 3);

    console.log(
      `[STATS] Top users: ${topUsers
        .map((u) => `${u.id} (${formatMana(u.totalCreditsConsumed)})`)
        .join(", ")}`
    );
  }
}
