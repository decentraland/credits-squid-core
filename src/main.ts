import { assertNotNull, EvmBatchProcessor, Log } from "@subsquid/evm-processor";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { CreditConsumption, SquidRouterOrder, AcrossOrder } from "./model";
import { UserCreditStats, HourlyCreditUsage, DailyCreditUsage } from "./model";
import { events as CreditsEvents } from "./abi/credits";
import { events as ERC20Events } from "./abi/erc20";
import { events as SpokeEvents } from "./abi/spoke";
import { events as AcrossEvents } from "./abi/acrossSpokePool";
import {
  createSlackComponent,
  getCreditUsedMessage,
  getCrossChainCreditMessage,
  getAcrossCreditMessage,
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
import { fetchAcrossStatus, AcrossDepositStatus } from "./across";

// Pending orders that need polling for the destination tx hash.
// `provider` discriminates which status API to poll (Squid vs Across).
interface PendingOrderInfo {
  provider: "squid" | "across";
  // Squid order hash, or Across deposit ID — used only for logging / message keys.
  orderHash: string;
  polygonTxHash: string;
  slackTs: string;
  slackChannel: string;
  totalCreditsUsed: bigint;
  // For Squid this is WETH; for Across this is the bridge token (typically USDC, 6 decimals).
  // bridgeInputToken disambiguates so Slack can format with the right decimals.
  bridgeInputAmount: bigint;
  bridgeInputToken: string | null;
  creditCount: number;
  timestamp: Date;
  retryCount: number;
  beneficiary: string;
  executorAddress: string;
}

const pendingOrders = new Map<string, PendingOrderInfo>();

// Normalize a bytes32-encoded address (left-padded) to a 20-byte hex address.
function bytes32ToAddress(b32: string): string {
  return ("0x" + b32.slice(-40)).toLowerCase();
}
const POLLING_INTERVAL_MS = 30000; // 30 seconds
const MAX_RETRIES = 30; // ~15 minutes max polling

const schemaName = process.env.DB_SCHEMA;
const RPC_ENDPOINT = process.env.RPC_ENDPOINT_POLYGON;
const SQUID_API_KEY = assertNotNull(
  process.env.SQUID_API_KEY,
  "SQUID_API_KEY env var is required — the Subsquid gateway returns 403 without it (see https://docs.sqd.dev/v2-keys)"
);
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

// Across SpokePool on Polygon mainnet. Verified on-chain: emits the unified
// `FundsDeposited` event (topic 0x32ed1a40...). Across has no canonical Polygon
// Amoy deployment, so testnet is left configurable via env (ACROSS_SPOKE_POOL_ADDRESS)
// and the listener is only wired when an address is available.
export const ACROSS_SPOKE_POOL_ADDRESS = (
  process.env.ACROSS_SPOKE_POOL_ADDRESS ||
  (isMainnet ? "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096" : "")
).toLowerCase();

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
 * Build the Slack message for a pending order, picking the provider-appropriate
 * formatter (Squid vs Across). `orderRef` is the Squid order hash or Across deposit ID.
 */
function buildCrossChainMessage(
  orderRef: string,
  info: PendingOrderInfo,
  destinationTxHash: string | null,
  status: string | null | undefined,
  opts: { isStalled?: boolean } = {}
) {
  const messageOptions = {
    ...opts,
    executorAddress: info.executorAddress,
  };
  return info.provider === "across"
    ? getAcrossCreditMessage(
        info.totalCreditsUsed,
        info.bridgeInputAmount,
        info.bridgeInputToken,
        info.creditCount,
        info.polygonTxHash,
        destinationTxHash,
        orderRef,
        status,
        info.timestamp,
        info.beneficiary,
        messageOptions
      )
    : getCrossChainCreditMessage(
        info.totalCreditsUsed,
        info.bridgeInputAmount,
        info.creditCount,
        info.polygonTxHash,
        destinationTxHash,
        orderRef,
        status,
        info.timestamp,
        info.beneficiary,
        messageOptions
      );
}

/**
 * Update the Slack message for an order whose polling has run out without a destination tx,
 * tagging the core team so the stalled / unreachable order is investigated.
 * Credits were consumed on Polygon but the bridge never reported a destination tx.
 */
async function flagStalledOrder(
  orderRef: string,
  info: PendingOrderInfo,
  lastStatus: string | null | undefined
) {
  if (!slackComponent) return;
  try {
    const stalledMessage = buildCrossChainMessage(
      orderRef,
      info,
      null,
      lastStatus,
      { isStalled: true }
    );
    await slackComponent.updateMessage(
      info.slackChannel,
      info.slackTs,
      stalledMessage
    );
  } catch (error) {
    console.error(
      `[POLLING] ❌ Failed to send stalled-order alert:`,
      error
    );
  }
}

/**
 * Fetch the destination tx + status for a pending order from the right bridge API.
 * Returns whether the status is terminal (so polling can stop even without a dest tx).
 */
async function fetchPendingOrderStatus(info: PendingOrderInfo): Promise<{
  destinationTxHash: string | null;
  status: string | null;
  isFinal: boolean;
}> {
  if (info.provider === "across") {
    const { destinationTxHash, status } = await fetchAcrossStatus(
      info.polygonTxHash
    );
    const isFinal =
      status === AcrossDepositStatus.FILLED ||
      status === AcrossDepositStatus.REFUNDED ||
      status === AcrossDepositStatus.EXPIRED;
    return { destinationTxHash, status, isFinal };
  }

  const { destinationTxHash, status } = await fetchSquidStatus(
    info.polygonTxHash
  );
  const isFinal =
    status === SquidTransactionStatus.SUCCESS ||
    status === SquidTransactionStatus.PARTIAL_SUCCESS ||
    status === SquidTransactionStatus.REFUND_STATUS ||
    status === SquidTransactionStatus.NEEDS_GAS;
  return { destinationTxHash, status, isFinal };
}

/**
 * Background polling for pending cross-chain orders (Squid + Across).
 * Polls the provider's status API and updates Slack messages when the destination tx is available.
 */
async function pollPendingOrders() {
  if (!slackComponent || pendingOrders.size === 0) return;

  for (const [orderRef, info] of pendingOrders.entries()) {
    let lastStatus: string | null | undefined;
    try {
      const { destinationTxHash, status, isFinal } =
        await fetchPendingOrderStatus(info);
      lastStatus = status;

      if (destinationTxHash || isFinal) {
        const updatedMessage = buildCrossChainMessage(
          orderRef,
          info,
          destinationTxHash,
          status
        );

        await slackComponent.updateMessage(
          info.slackChannel,
          info.slackTs,
          updatedMessage
        );

        console.log(
          `[POLLING] ✅ Updated Slack for ${info.provider} order ${orderRef.slice(
            0,
            18
          )}...: status=${status}, destTx=${
            destinationTxHash?.slice(0, 18) || "none"
          }`
        );

        pendingOrders.delete(orderRef);
      } else {
        // Increment retry count
        info.retryCount++;

        if (info.retryCount >= MAX_RETRIES) {
          console.log(
            `[POLLING] ⚠️ Max retries reached for order ${orderRef.slice(
              0,
              18
            )}..., flagging as stalled`
          );
          await flagStalledOrder(orderRef, info, lastStatus);
          pendingOrders.delete(orderRef);
        }
      }
    } catch (error) {
      console.error(
        `[POLLING] ❌ Error polling order ${orderRef.slice(0, 18)}...:`,
        error
      );
      info.retryCount++;
      if (info.retryCount >= MAX_RETRIES) {
        console.log(
          `[POLLING] ⚠️ Max retries reached after persistent errors for order ${orderRef.slice(
            0,
            18
          )}..., flagging as stalled`
        );
        await flagStalledOrder(orderRef, info, lastStatus);
        pendingOrders.delete(orderRef);
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
  .setGateway({ url: GATEWAY, apiKey: SQUID_API_KEY })
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

// Across deposits emit FundsDeposited on the SpokePool. Only wire the listener when
// we have an address for the current network (mainnet always; testnet only if set via env).
if (ACROSS_SPOKE_POOL_ADDRESS) {
  processor.addLog({
    address: [ACROSS_SPOKE_POOL_ADDRESS],
    topic0: [AcrossEvents.FundsDeposited.topic],
  });
}

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
      const acrossOrders = new Map<string, AcrossOrder>();
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

      // Store Across FundsDeposited events by txHash for correlation with credits
      const acrossDepositByTx = new Map<
        string,
        { depositId: string; deposit: any; log: any }
      >();

      // Track new orders to send Slack notifications at end of batch
      const newOrderHashes = new Set<string>();
      const newAcrossDepositIds = new Set<string>();

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

          // Across FundsDeposited events (only if the listener is wired for this network)
          if (
            ACROSS_SPOKE_POOL_ADDRESS &&
            log.address.toLowerCase() === ACROSS_SPOKE_POOL_ADDRESS &&
            log.topics[0] === AcrossEvents.FundsDeposited.topic
          ) {
            const deposit = AcrossEvents.FundsDeposited.decode(log);
            const depositId = deposit.depositId.toString();
            const txHash =
              log.transactionHash ||
              `unknown-${block.header.height}-${log.logIndex}`;

            acrossDepositByTx.set(txHash, { depositId, deposit, log });

            console.log(
              `[ACROSS] 🔗 FundsDeposited: depositId=${depositId.slice(
                0,
                18
              )}..., depositor=${bytes32ToAddress(deposit.depositor).slice(
                0,
                10
              )}..., dstChain=${deposit.destinationChainId.toString()}`
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
                  // CreditUsed._sender is the actual user spending credits;
                  // the Spoke's `order.fromAddress` is the Credits Executor contract.
                  beneficiary: _sender.toLowerCase(),
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

            // If there's an Across FundsDeposited event in the same tx, create or update AcrossOrder
            const acrossData = acrossDepositByTx.get(txHash);
            if (acrossData) {
              const { depositId, deposit } = acrossData;

              let acrossOrder = acrossOrders.get(depositId);

              if (!acrossOrder) {
                acrossOrder = new AcrossOrder({
                  id: depositId,
                  depositId,
                  creditIds: [],
                  totalCreditsUsed: BigInt(0),
                  // CreditUsed._sender is the end user; the deposit's `depositor` is the
                  // SpokePoolPeriphery / Credits Executor that made the on-chain deposit.
                  beneficiary: _sender.toLowerCase(),
                  depositor: bytes32ToAddress(deposit.depositor),
                  recipient: bytes32ToAddress(deposit.recipient),
                  inputToken: bytes32ToAddress(deposit.inputToken),
                  outputToken: bytes32ToAddress(deposit.outputToken),
                  inputAmount: deposit.inputAmount,
                  outputAmount: deposit.outputAmount,
                  destinationChainId: deposit.destinationChainId,
                  txHash,
                  destinationTxHash: null,
                  acrossStatus: null,
                  blockNumber: block.header.height,
                  timestamp,
                });
                acrossOrders.set(depositId, acrossOrder);
                newAcrossDepositIds.add(depositId);
              }

              acrossOrder.creditIds = [...acrossOrder.creditIds, salt];
              acrossOrder.totalCreditsUsed =
                acrossOrder.totalCreditsUsed + _value;

              console.log(
                `[ACROSS] 🌉 AcrossOrder ${depositId.slice(0, 18)}...: ${
                  acrossOrder.creditIds.length
                } credits, total=${formatMana(acrossOrder.totalCreditsUsed)}`
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
                  squidOrder.timestamp,
                  squidOrder.beneficiary ?? squidOrder.fromAddress,
                  { executorAddress: squidOrder.fromAddress }
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
                  provider: "squid",
                  orderHash: orderHashStr,
                  polygonTxHash: squidOrder.txHash,
                  slackTs: slackResult.ts,
                  slackChannel: slackResult.channel,
                  totalCreditsUsed: squidOrder.totalCreditsUsed,
                  bridgeInputAmount: squidOrder.fromAmount ?? BigInt(0),
                  bridgeInputToken: squidOrder.fromToken ?? null,
                  creditCount: squidOrder.creditIds.length,
                  timestamp: squidOrder.timestamp,
                  retryCount: 0,
                  beneficiary: squidOrder.beneficiary ?? squidOrder.fromAddress,
                  executorAddress: squidOrder.fromAddress,
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

      // Process new Across orders: fetch deposit status and send Slack notifications.
      // Mirrors the Squid loop above but uses the Across API and message format.
      for (const depositId of newAcrossDepositIds) {
        const acrossOrder = acrossOrders.get(depositId);
        if (!acrossOrder) continue;

        try {
          const { destinationTxHash, status } = await fetchAcrossStatus(
            acrossOrder.txHash
          );
          acrossOrder.destinationTxHash = destinationTxHash;
          acrossOrder.acrossStatus = status;

          if (destinationTxHash) {
            console.log(
              `[ACROSS] ✅ Got destination fill tx: ${destinationTxHash.slice(
                0,
                18
              )}...`
            );
          }
        } catch (error) {
          console.error(`[ACROSS] ❌ Failed to fetch status:`, error);
        }

        if (slackComponent) {
          try {
            const lastNotified = await getLastNotified(ctx.store);
            if (!lastNotified || lastNotified <= acrossOrder.blockNumber) {
              const slackResult = await slackComponent.sendMessage(
                SLACK_CROSS_CHAIN_CHANNEL,
                getAcrossCreditMessage(
                  acrossOrder.totalCreditsUsed,
                  acrossOrder.inputAmount ?? BigInt(0),
                  acrossOrder.inputToken,
                  acrossOrder.creditIds.length,
                  acrossOrder.txHash,
                  acrossOrder.destinationTxHash,
                  depositId,
                  acrossOrder.acrossStatus,
                  acrossOrder.timestamp,
                  acrossOrder.beneficiary ?? acrossOrder.depositor,
                  { executorAddress: acrossOrder.depositor }
                )
              );

              console.log(
                `[SLACK] ✅ Sent Across cross-chain notification: ${
                  acrossOrder.creditIds.length
                } credits, ${formatMana(acrossOrder.totalCreditsUsed)}`
              );

              // Only queue for polling if the deposit is not yet in a TERMINAL state.
              // Filled/refunded/expired are all final — no need to poll further. Previously
              // we only checked filled+destTx, so refunded/expired initial responses would
              // queue one wasted poll cycle before resolving.
              const isTerminal =
                acrossOrder.acrossStatus === AcrossDepositStatus.FILLED ||
                acrossOrder.acrossStatus === AcrossDepositStatus.REFUNDED ||
                acrossOrder.acrossStatus === AcrossDepositStatus.EXPIRED;
              if (slackResult.ts && slackResult.channel && !isTerminal) {
                pendingOrders.set(depositId, {
                  provider: "across",
                  orderHash: depositId,
                  polygonTxHash: acrossOrder.txHash,
                  slackTs: slackResult.ts,
                  slackChannel: slackResult.channel,
                  totalCreditsUsed: acrossOrder.totalCreditsUsed,
                  bridgeInputAmount: acrossOrder.inputAmount ?? BigInt(0),
                  bridgeInputToken: acrossOrder.inputToken ?? null,
                  creditCount: acrossOrder.creditIds.length,
                  timestamp: acrossOrder.timestamp,
                  retryCount: 0,
                  beneficiary: acrossOrder.beneficiary ?? acrossOrder.depositor,
                  executorAddress: acrossOrder.depositor,
                });
                console.log(
                  `[POLLING] 📥 Added Across order ${depositId.slice(
                    0,
                    18
                  )}... to polling queue`
                );
              }
            }
          } catch (error) {
            console.error(
              `[SLACK] ❌ Failed to send Across cross-chain notification:`,
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
      await ctx.store.save([...acrossOrders.values()]);

      // Only log batch completion if something was processed
      const totalEntities =
        userStats.size +
        uniqueConsumptions.length +
        manaTransactions.length +
        squidRouterOrders.size +
        acrossOrders.size;
      if (totalEntities > 0) {
        console.log(
          `[PROCESSOR] ✅ Batch complete: ${uniqueConsumptions.length} consumptions, ${userStats.size} users, ${manaTransactions.length} MANA tx, ${squidRouterOrders.size} Squid orders, ${acrossOrders.size} Across orders`
        );
      }
    });
  })
  .catch((err) => {
    console.error("[PROCESSOR] ERROR: Failed to start processor:", err);
    process.exit(1);
  });
