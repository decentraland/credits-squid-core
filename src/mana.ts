import { Store } from "@subsquid/typeorm-store";
import { Log } from "@subsquid/evm-processor";
import { CreditConsumption, ManaTransaction } from "./model";
import { formatMana, formatAddress } from "./utils";

// DAO address that receives fees
const DAO_ADDRESS = "0xb08e3e7cc815213304d884c88ca476ebc50eaab2";

/**
 * Find all MANA transfers in a set of logs for a specific transaction
 */
export function findManaTransfersInBlock(
  logs: any[],
  manaContractAddress: string,
  ERC20Events: any,
  timestamp: Date,
  blockHeight: number
): any[] {
  const manaTransfers = [];

  for (const log of logs) {
    if (
      log.address === manaContractAddress &&
      log.topics[0] === ERC20Events.Transfer.topic
    ) {
      const { from, to, value } = ERC20Events.Transfer.decode(log);
      const normalizedFrom = from.toLowerCase();
      const normalizedTo = to.toLowerCase();

      // Check if this is a DAO fee transfer
      const isDaoFee = normalizedTo === DAO_ADDRESS.toLowerCase();

      console.log(
        `[MANA] 🪙 Transfer: ${normalizedFrom} → ${normalizedTo}, amount: ${formatMana(
          value
        )}, block: ${blockHeight}. ${isDaoFee ? "DAO fee 💰" : ""}`
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
    }
  }

  return manaTransfers;
}

/**
 * Create MANA Transaction entities from the collected transfers and consumptions
 */
export function createManaTransactions(
  manaTransfersByTx: Map<string, any[]>,
  creditConsumptionsByTx: Map<string, CreditConsumption[]>,
  store: Store
): ManaTransaction[] {
  const manaTransactions: ManaTransaction[] = [];
  const processedTxs = new Set<string>();

  console.log(
    `[MANA] Processing ${manaTransfersByTx.size} transactions with MANA transfers`
  );

  // First check transactions that have both MANA transfers and credit consumptions
  for (const [txHash, consumptions] of creditConsumptionsByTx.entries()) {
    const transfers = manaTransfersByTx.get(txHash) || [];

    // Create a transaction even if no MANA transfers found (might be recovered later)
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

  // Check for MANA transfers without credit consumptions
  for (const [txHash, transfers] of manaTransfersByTx.entries()) {
    // Skip already processed transactions
    if (processedTxs.has(txHash)) continue;

    // Create a transaction for any remaining transfers
    const transaction = createSingleManaTransaction(txHash, transfers, []);
    if (transaction) {
      manaTransactions.push(transaction);
    }
  }

  // Check for orphaned credit consumptions (no matching transfers)
  recoverOrphanedConsumptions(
    creditConsumptionsByTx,
    processedTxs,
    manaTransactions,
    store
  );

  return manaTransactions;
}

/**
 * Create a single MANA Transaction entity for a given transaction hash
 */
function createSingleManaTransaction(
  txHash: string,
  transfers: any[],
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

  // Get main transfers (non-DAO fees)
  const mainTransfers = sortedTransfers.filter((t) => !t.isDaoFee);

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

  // If we have main transfers, use the largest one as the main transfer
  // Otherwise, just create a placeholder with the consumption info
  let fromAddress = "";
  let toAddress = "";
  let totalManaAmount = 0n;
  let timestamp = new Date();
  let blockHeight = 0;
  let logIndex = 0;

  if (mainTransfers.length > 0) {
    // Use the largest transfer as the main one
    const mainTransfer = mainTransfers[0];
    fromAddress = mainTransfer.fromAddress;
    toAddress = mainTransfer.toAddress;
    totalManaAmount = mainTransfer.totalManaAmount;
    timestamp = mainTransfer.timestamp;
    blockHeight = mainTransfer.block;
    logIndex = mainTransfer.logIndex;
  } else if (consumptions.length > 0) {
    // If no transfers but we have consumptions, use the first consumption's info
    const firstConsumption = consumptions[0];
    fromAddress = firstConsumption.beneficiary.id.toLowerCase();
    toAddress = firstConsumption.contract.toLowerCase();
    totalManaAmount = 0n; // No MANA transfer found yet
    timestamp = firstConsumption.timestamp;
    blockHeight = firstConsumption.block;
    logIndex = 0; // No real log index available
  } else {
    // This shouldn't happen given our earlier check, but just in case
    return null;
  }

  // Generate ID for the transaction
  const id = `${txHash}-${logIndex}`;

  // Log transaction summary
  const totalAmount = totalManaAmount + (totalDaoFees || 0n);
  console.log(`[MANA] 💵 Transaction ${txHash} summary:`);
  console.log(`  - Total: ${formatMana(totalAmount)}`);
  console.log(`  - Main: ${formatMana(totalManaAmount)}`);
  if (totalDaoFees > 0n)
    console.log(`  - DAO fees: ${formatMana(totalDaoFees)}`);
  if (creditAmount > 0n)
    console.log(`  - Credits: ${formatMana(creditAmount)}`);
  if (userPaidAmount > 0n)
    console.log(`  - User paid: ${formatMana(userPaidAmount)}`);
  console.log(`  - Consumptions: ${consumptionIds.length}`);

  // Create the ManaTransaction entity
  return new ManaTransaction({
    id,
    txHash,
    fromAddress,
    toAddress,
    totalManaAmount,
    creditAmount: creditAmount > 0n ? creditAmount : null,
    userPaidAmount: userPaidAmount > 0n ? userPaidAmount : null,
    daoFeeAmount: totalDaoFees > 0n ? totalDaoFees : null,
    relatedConsumptionIds: consumptionIds.length > 0 ? consumptionIds : [],
    timestamp,
    block: blockHeight,
  });
}

/**
 * Try to recover orphaned consumptions by checking for existing transactions
 */
async function recoverOrphanedConsumptions(
  creditConsumptionsByTx: Map<string, CreditConsumption[]>,
  processedTxs: Set<string>,
  manaTransactions: ManaTransaction[],
  store: Store
): Promise<void> {
  let orphanedTxCount = 0;
  let orphanedConsumptionCount = 0;
  let recoveredCount = 0;

  for (const [txHash, consumptions] of creditConsumptionsByTx.entries()) {
    // Skip transactions that were already processed
    if (processedTxs.has(txHash)) continue;

    orphanedTxCount++;
    orphanedConsumptionCount += consumptions.length;

    // Try to find existing transactions in database for this txHash
    try {
      const existingTransactions = await store.find(ManaTransaction, {
        where: { txHash },
      });

      if (existingTransactions.length > 0) {
        // Process consumptions against existing transactions
        for (const consumption of consumptions) {
          let added = false;

          // Try to add to each existing transaction
          for (const existingTx of existingTransactions) {
            // Clone the existing transaction for modification
            const updatedTx = new ManaTransaction({
              ...existingTx,
            });

            // Get existing relatedConsumptionIds or initialize an empty array
            const relatedIds = updatedTx.relatedConsumptionIds || [];

            // Add this consumption ID if not already present
            if (!relatedIds.includes(consumption.id)) {
              relatedIds.push(consumption.id);
              updatedTx.relatedConsumptionIds = relatedIds;

              // Update credit amount
              if (!updatedTx.creditAmount) {
                updatedTx.creditAmount = consumption.amount;
              } else {
                updatedTx.creditAmount += consumption.amount;
              }

              // Add to our list of transactions to save
              manaTransactions.push(updatedTx);
              added = true;
              recoveredCount++;
              break; // Successfully added to this transaction
            }
          }

          // If we couldn't add to any existing transaction, create a new one
          if (!added) {
            const newTx = createSingleManaTransaction(
              txHash,
              [],
              [consumption]
            );
            if (newTx) {
              manaTransactions.push(newTx);
              recoveredCount++;
            }
          }
        }
      } else {
        // No existing transactions, create new ones for these consumptions
        const newTx = createSingleManaTransaction(txHash, [], consumptions);
        if (newTx) {
          manaTransactions.push(newTx);
          recoveredCount += consumptions.length;
        }
      }
    } catch (error) {
      console.error(
        `[MANA] ERROR: Failed to check for existing transactions: ${error}`
      );

      // Create a new transaction for these orphaned consumptions
      const newTx = createSingleManaTransaction(txHash, [], consumptions);
      if (newTx) {
        manaTransactions.push(newTx);
        recoveredCount += consumptions.length;
      }
    }
  }

  if (orphanedConsumptionCount > 0) {
    console.log(
      `[MANA] Orphaned consumption recovery: ${recoveredCount}/${orphanedConsumptionCount} consumptions processed from ${orphanedTxCount} transactions`
    );
  }
}
