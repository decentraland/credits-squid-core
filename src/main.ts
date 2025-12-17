import { assertNotNull, EvmBatchProcessor, Log } from "@subsquid/evm-processor";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { CreditConsumption, SquidRouterOrder } from "./model";
import { UserCreditStats, HourlyCreditUsage, DailyCreditUsage } from "./model";
import { events as CreditsEvents } from "./abi/credits";
import { events as ERC20Events } from "./abi/erc20";
import { events as SpokeEvents } from "./abi/spoke";
import {
  createSlackComponent,
  getCreditUsedMessage,
  getCrossChainCreditMessage,
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
import { fetchSquidStatus, SquidTransactionStatus } from "./coral";

// Pending orders that need polling for Ethereum tx hash
interface PendingOrderInfo {
  orderHash: string;
  polygonTxHash: string;
  slackTs: string;
  slackChannel: string;
  totalCreditsUsed: bigint;
  wethBridged: bigint;
  creditCount: number;
  timestamp: Date;
  retryCount: number;
}

const pendingOrders = new Map<string, PendingOrderInfo>();
const POLLING_INTERVAL_MS = 30000; // 30 seconds
const MAX_RETRIES = 30; // ~15 minutes max polling

const schemaName = process.env.DB_SCHEMA;
const RPC_ENDPOINT = process.env.RPC_ENDPOINT_POLYGON;
const PROMETHEUS_PORT = process.env.PROMETHEUS_PORT || 3001;
const isMainnet = process.env.POLYGON_CHAIN_ID === "137";

// Slack channels
const SLACK_NOTIFICATIONS_CHANNEL = isMainnet
  ? "credits-notifications"
  : "credits-notifications-dev";

const SLACK_CROSS_CHAIN_CHANNEL = isMainnet
  ? "credits-notifications-cross-chain"
  : "credits-notifications-cross-chain-dev";

export const MANA_CONTRACT_ADDRESS = isMainnet
  ? "0xa1c57f48f0deb89f569dfbe6e2b7f46d33606fd4"
  : "0x7ad72b9f944ea9793cf4055d88f81138cc2c63a0";

// DAO address that receives fees
export const DAO_ADDRESS = "0xb08e3e7cc815213304d884c88ca476ebc50eaab2";

export const CREDITS_CONTRACT_ADDRESSES = isMainnet
  ? [
      "0xe9f961e6ded4e1476bbee4faab886d63a2493eb9",
      "0x8b3a40ca1b6f5cafc99d112a4d02e897d1fd8cc5",
    ]
  : ["0x8052a560e6e6ac86eeb7e711a4497f639b322fb3"];

// Squid Router Spoke contract (CORAL) - same address on mainnet and amoy
export const SPOKE_CONTRACT_ADDRESS =
  "0xfe91aaa1012b47499cfe8758874f2d2c52b22cd8";

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

/**
 * Background polling for pending cross-chain orders
 * Polls Squid API and updates Slack messages when Ethereum tx is available
 */
async function pollPendingOrders() {
  if (!slackComponent || pendingOrders.size === 0) return;

  for (const [orderHash, info] of pendingOrders.entries()) {
    try {
      const { destinationTxHash, status } = await fetchSquidStatus(
        info.polygonTxHash
      );

      // Check if we got a final status
      const isFinal =
        status === SquidTransactionStatus.SUCCESS ||
        status === SquidTransactionStatus.PARTIAL_SUCCESS ||
        status === SquidTransactionStatus.REFUND_STATUS ||
        status === SquidTransactionStatus.NEEDS_GAS;

      if (destinationTxHash || isFinal) {
        // Update Slack message with final status
        const updatedMessage = getCrossChainCreditMessage(
          info.totalCreditsUsed,
          info.wethBridged,
          info.creditCount,
          info.polygonTxHash,
          destinationTxHash,
          orderHash,
          status,
          info.timestamp
        );

        await slackComponent.updateMessage(
          info.slackChannel,
          info.slackTs,
          updatedMessage
        );

        console.log(
          `[POLLING] ✅ Updated Slack for order ${orderHash.slice(
            0,
            18
          )}...: status=${status}, ethTx=${
            destinationTxHash?.slice(0, 18) || "none"
          }`
        );

        pendingOrders.delete(orderHash);
      } else {
        // Increment retry count
        info.retryCount++;

        if (info.retryCount >= MAX_RETRIES) {
          console.log(
            `[POLLING] ⚠️ Max retries reached for order ${orderHash.slice(
              0,
              18
            )}..., removing from queue`
          );
          pendingOrders.delete(orderHash);
        }
      }
    } catch (error) {
      console.error(
        `[POLLING] ❌ Error polling order ${orderHash.slice(0, 18)}...:`,
        error
      );
      info.retryCount++;
      if (info.retryCount >= MAX_RETRIES) {
        pendingOrders.delete(orderHash);
      }
    }
  }
}

// Start background polling (non-blocking)
setInterval(() => {
  pollPendingOrders().catch((err) =>
    console.error("[POLLING] Background polling error:", err)
  );
}, POLLING_INTERVAL_MS);

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
    address: CREDITS_CONTRACT_ADDRESSES,
    topic0: [CreditsEvents.CreditUsed.topic],
  })
  .addLog({
    address: [SPOKE_CONTRACT_ADDRESS],
    topic0: [SpokeEvents.OrderCreated.topic],
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
      const squidRouterOrders = new Map<string, SquidRouterOrder>();
      const userStats = new Map<string, UserCreditStats>();
      const hourlyUsage = new Map<string, HourlyCreditUsage>();
      const dailyUsage = new Map<string, DailyCreditUsage>();

      // Store MANA transfers and credit consumptions by transaction hash
      const manaTransfersByTx = new Map<string, ManaTransfer[]>();
      const creditConsumptionsByTx = new Map<string, CreditConsumption[]>();

      // Store OrderCreated events by txHash for correlation with credits
      const orderCreatedByTx = new Map<
        string,
        { orderHash: string; order: any; log: any }
      >();

      // Track new orders to send Slack notifications at end of batch
      const newOrderHashes = new Set<string>();

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

        // First pass: Find all OrderCreated events and index by txHash
        for (let log of block.logs) {
          if (
            log.address.toLowerCase() ===
              SPOKE_CONTRACT_ADDRESS.toLowerCase() &&
            log.topics[0] === SpokeEvents.OrderCreated.topic
          ) {
            const { orderHash, order } = SpokeEvents.OrderCreated.decode(log);
            const txHash =
              log.transactionHash ||
              `unknown-${block.header.height}-${log.logIndex}`;

            orderCreatedByTx.set(txHash, { orderHash, order, log });

            console.log(
              `[SPOKE] 🔗 OrderCreated: orderHash=${orderHash.slice(
                0,
                18
              )}..., from=${order.fromAddress.slice(0, 10)}...`
            );
          }
        }

        // Now process credit usage events
        for (let log of block.logs) {
          // Process Credit Usage events
          if (
            CREDITS_CONTRACT_ADDRESSES.includes(log.address.toLowerCase()) &&
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

            // Check if there's an OrderCreated event in the same transaction
            const orderData = orderCreatedByTx.get(txHash);
            const orderHash = orderData ? orderData.orderHash : undefined;

            console.log(
              `[CREDITS] 💸 Used: id=${salt}, sender=${_sender}, amount=${formattedMana}${
                orderHash ? `, orderHash=${orderHash.slice(0, 18)}...` : ""
              }`
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

            // Create credit consumption record with optional orderHash
            const consumption = new CreditConsumption({
              id: consumptionId,
              creditId: salt,
              contract: log.address,
              beneficiary: userStat,
              amount: _value,
              timestamp,
              block: block.header.height,
              txHash,
              orderHash: orderHash || null,
            });

            consumptions.push(consumption);

            // If there's an OrderCreated event, create or update SquidRouterOrder
            if (orderData && orderHash) {
              const { order } = orderData;
              const orderHashStr = orderHash; // TypeScript knows this is string here

              // Get or create SquidRouterOrder
              let squidOrder = squidRouterOrders.get(orderHashStr);

              if (!squidOrder) {
                squidOrder = new SquidRouterOrder({
                  id: orderHashStr,
                  orderHash: orderHashStr,
                  creditIds: [],
                  totalCreditsUsed: BigInt(0),
                  fromAddress: order.fromAddress.toLowerCase(),
                  toAddress: order.toAddress.toLowerCase(),
                  filler: order.filler.toLowerCase(),
                  fromToken: order.fromToken.toLowerCase(),
                  toToken: order.toToken.toLowerCase(),
                  fromAmount: order.fromAmount,
                  fillAmount: order.fillAmount,
                  feeRate: order.feeRate,
                  fromChain: order.fromChain,
                  toChain: order.toChain,
                  txHash,
                  destinationTxHash: null,
                  squidStatus: null,
                  blockNumber: block.header.height,
                  timestamp,
                });
                squidRouterOrders.set(orderHashStr, squidOrder);
                newOrderHashes.add(orderHashStr); // Track for Slack notification at end
              }

              // Add this credit to the order
              squidOrder.creditIds = [...squidOrder.creditIds, salt];
              squidOrder.totalCreditsUsed =
                squidOrder.totalCreditsUsed + _value;

              console.log(
                `[SPOKE] 🦑 SquidRouterOrder ${orderHashStr.slice(0, 18)}...: ${
                  squidOrder.creditIds.length
                } credits, total=${formatMana(squidOrder.totalCreditsUsed)}`
              );
            }

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

      // Process new orders: fetch Squid status and send Slack notifications
      // This happens AFTER all credits are accumulated
      for (const orderHashStr of newOrderHashes) {
        const squidOrder = squidRouterOrders.get(orderHashStr);
        if (!squidOrder) continue;

        // Fetch Squid Router status to get destination (Ethereum) tx hash
        try {
          const { destinationTxHash, status } = await fetchSquidStatus(
            squidOrder.txHash
          );
          squidOrder.destinationTxHash = destinationTxHash;
          squidOrder.squidStatus = status;

          if (destinationTxHash) {
            console.log(
              `[CORAL] ✅ Got Ethereum tx: ${destinationTxHash.slice(0, 18)}...`
            );
          }
        } catch (error) {
          console.error(`[CORAL] ❌ Failed to fetch status:`, error);
        }

        // Send Slack notification with all accumulated credits
        if (slackComponent) {
          try {
            const lastNotified = await getLastNotified(ctx.store);
            if (!lastNotified || lastNotified <= squidOrder.blockNumber) {
              const slackResult = await slackComponent.sendMessage(
                SLACK_CROSS_CHAIN_CHANNEL,
                getCrossChainCreditMessage(
                  squidOrder.totalCreditsUsed,
                  squidOrder.fromAmount ?? BigInt(0),
                  squidOrder.creditIds.length,
                  squidOrder.txHash,
                  squidOrder.destinationTxHash,
                  orderHashStr,
                  squidOrder.squidStatus,
                  squidOrder.timestamp
                )
              );

              console.log(
                `[SLACK] ✅ Sent cross-chain notification: ${
                  squidOrder.creditIds.length
                } credits, ${formatMana(squidOrder.totalCreditsUsed)}`
              );

              // If status is ongoing and no destination tx yet, add to polling queue
              if (
                slackResult.ts &&
                slackResult.channel &&
                (!squidOrder.destinationTxHash ||
                  squidOrder.squidStatus === SquidTransactionStatus.ONGOING)
              ) {
                pendingOrders.set(orderHashStr, {
                  orderHash: orderHashStr,
                  polygonTxHash: squidOrder.txHash,
                  slackTs: slackResult.ts,
                  slackChannel: slackResult.channel,
                  totalCreditsUsed: squidOrder.totalCreditsUsed,
                  wethBridged: squidOrder.fromAmount ?? BigInt(0),
                  creditCount: squidOrder.creditIds.length,
                  timestamp: squidOrder.timestamp,
                  retryCount: 0,
                });
                console.log(
                  `[POLLING] 📥 Added order ${orderHashStr.slice(
                    0,
                    18
                  )}... to polling queue`
                );
              }
            }
          } catch (error) {
            console.error(
              `[SLACK] ❌ Failed to send cross-chain notification:`,
              error
            );
          }
        }
      }

      // Save all entities to database
      await ctx.store.save([...userStats.values()]);
      await ctx.store.save([...hourlyUsage.values()]);
      await ctx.store.save([...dailyUsage.values()]);
      await ctx.store.save(uniqueConsumptions);
      await ctx.store.save(manaTransactions);
      await ctx.store.save([...squidRouterOrders.values()]);

      // Only log batch completion if something was processed
      const totalEntities =
        userStats.size +
        uniqueConsumptions.length +
        manaTransactions.length +
        squidRouterOrders.size;
      if (totalEntities > 0) {
        console.log(
          `[PROCESSOR] ✅ Batch complete: ${uniqueConsumptions.length} consumptions, ${userStats.size} users, ${manaTransactions.length} MANA tx, ${squidRouterOrders.size} Squid orders`
        );
      }
    });
  })
  .catch((err) => {
    console.error("[PROCESSOR] ERROR: Failed to start processor:", err);
    process.exit(1);
  });
