import { Store } from "@subsquid/typeorm-store";
import { Log } from "@subsquid/evm-processor";
import { CreditConsumption, ManaTransaction } from "./model";
import { formatMana } from "./utils";
import { events as ERC20Events } from "./abi/erc20";
import {
  DAO_ADDRESS,
  MANA_CONTRACT_ADDRESS,
  CREDITS_CONTRACT_ADDRESSES,
} from "./main";
import { ManaTransfer } from "./types";

/**
 * Find all MANA transfers in a set of logs for a specific transaction that are relevant to the credit system
 * We only care about:
 * 1. FROM credit manager TO creator (creator payment)
 * 2. FROM credit manager TO the DAO (DAO fee)
 * 3. FROM user TO credit manager (user payment for credits)
 */
export function findManaTransfersInBlock(
  logs: (Log & { transactionHash: string })[],
  timestamp: Date,
  blockHeight: number
): ManaTransfer[] {
  const manaTransfers: ManaTransfer[] = [];

  for (const log of logs) {
    if (
      log.address === MANA_CONTRACT_ADDRESS &&
      log.topics[0] === ERC20Events.Transfer.topic
    ) {
      try {
        const { from, to, value } = ERC20Events.Transfer.decode(log);

        // Normalize addresses
        const normalizedFrom = from.toLowerCase();
        const normalizedTo = to.toLowerCase();

        // Determine if this is a credit-related transfer
        const isFromCreditManager =
          CREDITS_CONTRACT_ADDRESSES.includes(normalizedFrom);
        const isToCreditManager =
          CREDITS_CONTRACT_ADDRESSES.includes(normalizedTo);

        // Check if this is a payment to the DAO FROM the Credit Manager
        const isDaoFee =
          isFromCreditManager && normalizedTo === DAO_ADDRESS.toLowerCase();

        // Only track transfers that are related to the credit system
        // 1. FROM credit manager TO creator (creator payment)
        // 2. FROM credit manager TO the DAO (DAO fee)
        // 3. FROM user TO credit manager (user payment along with credits)
        const isRelevant =
          isDaoFee || // DAO fee (must be from credit manager)
          (isFromCreditManager && !isDaoFee) || // Creator payment
          isToCreditManager; // User payment

        if (!isRelevant) {
          continue; // Skip irrelevant transfers
        }

        // Add role labels to addresses for clearer logs
        let fromLabel = normalizedFrom;
        let toLabel = normalizedTo;

        // Add role labels
        if (CREDITS_CONTRACT_ADDRESSES.includes(normalizedFrom)) {
          fromLabel = `${normalizedFrom} [CreditsManager]`;
        } else if (isToCreditManager) {
          fromLabel = `${normalizedFrom} [USER]`;
        }

        if (normalizedTo === DAO_ADDRESS.toLowerCase() && isFromCreditManager) {
          toLabel = `${normalizedTo} [DAO]`;
        } else if (isFromCreditManager && !isDaoFee) {
          toLabel = `${normalizedTo} [CREATOR]`;
        } else if (CREDITS_CONTRACT_ADDRESSES.includes(normalizedTo)) {
          toLabel = `${normalizedTo} [CreditsManager]`;
        }

        let transferType = "unknown";
        if (isDaoFee) transferType = "DAO fee 💰";
        else if (isFromCreditManager) transferType = "Creator payment 💵";
        else if (isToCreditManager) transferType = "User payment 💸";

        console.log(
          `[MANA] 🪙 Transfer: ${fromLabel} → ${toLabel}, amount: ${formatMana(
            value
          )}, ${transferType}, tx: ${
            log.transactionHash
          }, block: ${blockHeight}`
        );

        manaTransfers.push({
          fromAddress: normalizedFrom,
          toAddress: normalizedTo,
          totalManaAmount: value,
          timestamp,
          block: blockHeight,
          logIndex: log.logIndex,
          isDaoFee,
        });
      } catch (error) {
        console.error(
          `[MANA] Failed to decode transfer event at block ${blockHeight}, log ${log.logIndex}:`,
          error
        );
      }
    }
  }

  return manaTransfers;
}

/**
 * Create MANA Transaction entities from the collected transfers and consumptions
 */
export function createManaTransactions(
  manaTransfersByTx: Map<string, ManaTransfer[]>,
  creditConsumptionsByTx: Map<string, CreditConsumption[]>,
  store: Store
): ManaTransaction[] {
  const manaTransactions: ManaTransaction[] = [];
  const processedTxs = new Set<string>();

  // Get counts of relevant data
  const relevantTransferTxCount = manaTransfersByTx.size;
  const creditTxCount = creditConsumptionsByTx.size;

  if (relevantTransferTxCount > 0 || creditTxCount > 0) {
    console.log(
      `[MANA] Processing ${relevantTransferTxCount} transactions with relevant MANA transfers and ${creditTxCount} with credit consumptions`
    );
  }

  // First process transactions that have both MANA transfers and credit consumptions
  for (const [txHash, consumptions] of creditConsumptionsByTx.entries()) {
    const transfers = manaTransfersByTx.get(txHash) || [];

    // Process the transaction if it has either transfers or consumptions
    const transaction = createSingleManaTransaction(
      txHash,
      transfers,
      consumptions
    );

    if (transaction) {
      manaTransactions.push(transaction);
      processedTxs.add(txHash);
    }
  }

  // Process any MANA transfers not yet associated with consumptions
  for (const [txHash, transfers] of manaTransfersByTx.entries()) {
    // Skip already processed transactions
    if (processedTxs.has(txHash)) continue;

    // Create a transaction just for the MANA transfers
    const transaction = createSingleManaTransaction(txHash, transfers, []);
    if (transaction) {
      manaTransactions.push(transaction);
      processedTxs.add(txHash);
    }
  }

  // Check for orphaned consumptions without transfers
  if (creditConsumptionsByTx.size > processedTxs.size) {
    const orphanedTxs = Array.from(creditConsumptionsByTx.keys()).filter(
      (txHash) => !processedTxs.has(txHash)
    );

    if (orphanedTxs.length > 0) {
      console.log(
        `[MANA] Found ${orphanedTxs.length} txs with consumptions but no MANA transfers`
      );

      // Process the orphaned consumptions
      for (const txHash of orphanedTxs) {
        const consumptions = creditConsumptionsByTx.get(txHash) || [];
        const tx = createSingleManaTransaction(txHash, [], consumptions);
        if (tx) {
          manaTransactions.push(tx);
        }
      }
    }
  }

  if (manaTransactions.length > 0) {
    console.log(
      `[MANA] Created ${manaTransactions.length} MANA transaction records`
    );
  }

  return manaTransactions;
}

/**
 * Create a single MANA Transaction entity for a given transaction hash
 */
function createSingleManaTransaction(
  txHash: string,
  transfers: ManaTransfer[],
  consumptions: CreditConsumption[]
): ManaTransaction | null {
  if (transfers.length === 0 && consumptions.length === 0) {
    return null;
  }

  // Sort transfers by amount (largest first)
  const sortedTransfers = [...transfers].sort((a, b) =>
    b.totalManaAmount > a.totalManaAmount
      ? 1
      : b.totalManaAmount < a.totalManaAmount
      ? -1
      : 0
  );

  // Get creator fee transfers (non-DAO fees)
  const creatorTransfers = sortedTransfers.filter((t) => !t.isDaoFee);

  // Get DAO fee transfers
  const daoFeeTransfers = sortedTransfers.filter((t) => t.isDaoFee);

  // Calculate total DAO fees
  const totalDaoFees = daoFeeTransfers.reduce(
    (sum, t) => sum + t.totalManaAmount,
    0n
  );

  // Get user addresses from credit consumptions
  const beneficiaryAddresses = consumptions.map((c) =>
    c.beneficiary.id.toLowerCase()
  );

  // Find transfers from any of the beneficiaries (user payments)
  const userTransfers = sortedTransfers.filter(
    (t) => beneficiaryAddresses.includes(t.fromAddress) && !t.isDaoFee
  );

  // Calculate total user paid amount
  const userPaidAmount = userTransfers.reduce(
    (sum, t) => sum + t.totalManaAmount,
    0n
  );

  // Calculate total credit amount from all consumptions
  const creditAmount = consumptions.reduce((sum, c) => sum + c.amount, 0n);

  // Get consumption IDs
  const consumptionIds = consumptions.map((c) => c.id);

  // If we have creator transfers, use the largest one as the main transfer
  // Otherwise, just create a placeholder with the consumption info
  let fromAddress = "";
  let toAddress = "";
  let totalCreatorAmount = 0n;
  let timestamp = new Date();
  let blockHeight = 0;
  let logIndex = 0;

  if (creatorTransfers.length > 0) {
    // Use the largest transfer as the main one
    const mainTransfer = creatorTransfers[0];
    fromAddress = mainTransfer.fromAddress;
    toAddress = mainTransfer.toAddress;
    totalCreatorAmount = mainTransfer.totalManaAmount;
    timestamp = mainTransfer.timestamp;
    blockHeight = mainTransfer.block;
    logIndex = mainTransfer.logIndex;
  } else if (consumptions.length > 0) {
    // If no transfers but we have consumptions, use the first consumption's info
    const firstConsumption = consumptions[0];
    fromAddress = firstConsumption.beneficiary.id.toLowerCase();
    toAddress = firstConsumption.contract.toLowerCase();
    totalCreatorAmount = 0n; // No MANA transfer found yet
    timestamp = firstConsumption.timestamp;
    blockHeight = firstConsumption.block;
    logIndex = 0; // No real log index available
  } else {
    // This shouldn't happen given our earlier check, but just in case
    return null;
  }

  // Total amount should be the sum of creator amount and DAO fees
  const totalAmount = totalCreatorAmount + (totalDaoFees || 0n);

  // Create a unique ID for this transaction
  const id = `${txHash}-${blockHeight}-${logIndex}`;

  console.log(`[MANA] 💵 Transaction ${txHash} summary:`);

  const logParts = [];
  if (totalAmount > 0n) logParts.push(`Total: ${formatMana(totalAmount)}`);
  if (totalCreatorAmount > 0n)
    logParts.push(`Creator: ${formatMana(totalCreatorAmount)}`);
  if (totalDaoFees > 0n) logParts.push(`DAO: ${formatMana(totalDaoFees)}`);
  if (creditAmount > 0n) logParts.push(`Credits: ${formatMana(creditAmount)}`);
  if (userPaidAmount > 0n)
    logParts.push(`User paid: ${formatMana(userPaidAmount)}`);
  if (consumptions.length > 0)
    logParts.push(`Consumptions: ${consumptions.length}`);

  console.log(`  - ${logParts.join(" | ")}`);

  return new ManaTransaction({
    id,
    txHash,
    fromAddress,
    toAddress,
    totalManaAmount: totalCreatorAmount + totalDaoFees,
    creditAmount: creditAmount > 0n ? creditAmount : null,
    userPaidAmount: userPaidAmount > 0n ? userPaidAmount : null,
    daoFeeAmount: totalDaoFees > 0n ? totalDaoFees : null,
    relatedConsumptionIds: consumptionIds.length > 0 ? consumptionIds : null,
    timestamp,
    block: blockHeight,
  });
}
