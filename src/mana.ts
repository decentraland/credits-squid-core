import { Store } from "@subsquid/typeorm-store";
import { Log } from "@subsquid/evm-processor";
import { CreditConsumption, ManaTransaction } from "./model";
import { formatMana, formatAddress } from "./utils";

// DAO address that receives fees
const DAO_ADDRESS = "0xb08e3e7cc815213304d884c88ca476ebc50eaab2";

/**
 * Transaction data structure with all relevant information
 */
interface TransactionData {
  transfers: Array<{
    fromAddress: string;
    toAddress: string;
    totalManaAmount: bigint;
    timestamp: Date;
    block: number;
    logIndex: number;
    isDaoFee: boolean;
  }>;
  creditBeneficiaries: string[]; // Array of users who benefited from credits in this tx
  totalDaoFees: bigint;
  timestamp: Date;
  block: number;
}

/**
 * Map to track MANA transfers by transaction hash for correlation with credit usage
 */
const pendingTransactions = new Map<string, TransactionData>();

/**
 * Map to track credit consumptions by transaction hash for correlation with MANA transfers
 * Each transaction hash can have multiple consumptions
 */
const pendingCreditConsumptions = new Map<string, CreditConsumption[]>();

/**
 * Process a MANA transfer event
 */
export function processManaTransfer(
  store: Store,
  log: Log & { transactionHash: string },
  from: string,
  to: string,
  amount: bigint,
  timestamp: Date,
  block: number,
  creditsContractAddress: string
): void {
  // Get transaction hash via the transaction accessor
  const txHash = log.transactionHash;
  if (!txHash) {
    console.log(
      "[MANA] ERROR: No transaction hash available for MANA transfer"
    );
    return;
  }

  // Normalize addresses for comparison
  const normalizedFrom = from.toLowerCase();
  const normalizedTo = to.toLowerCase();
  const normalizedCreditsContract = creditsContractAddress.toLowerCase();

  // Check if this is a credits-related transfer
  const isCreditsInvolved =
    normalizedFrom === normalizedCreditsContract ||
    normalizedTo === normalizedCreditsContract;

  // Check if this is a DAO fee transfer
  const isDaoFee = normalizedTo === DAO_ADDRESS;

  // We also want to track transfers FROM a beneficiary as they might be paying for credits
  const isPotentialUserPayment = pendingCreditConsumptions.has(txHash);

  // We only want to track:
  // 1. Credits-related transfers
  // 2. DAO fees ONLY if we're already tracking the transaction (involves credits)
  // 3. User payments for transactions with pending credit consumptions
  if (
    !isCreditsInvolved &&
    !(isDaoFee && pendingTransactions.has(txHash)) &&
    !isPotentialUserPayment
  ) {
    return;
  }

  // Initialize transaction data if not already tracking
  if (!pendingTransactions.has(txHash)) {
    pendingTransactions.set(txHash, {
      transfers: [],
      creditBeneficiaries: [],
      totalDaoFees: 0n,
      timestamp,
      block,
    });
  }

  // Get the transaction data
  const txData = pendingTransactions.get(txHash)!;

  // Add this transfer
  txData.transfers.push({
    fromAddress: normalizedFrom,
    toAddress: normalizedTo,
    totalManaAmount: amount,
    timestamp,
    block,
    logIndex: log.logIndex,
    isDaoFee,
  });

  // Add to DAO fees if applicable
  if (isDaoFee) {
    txData.totalDaoFees += amount;
    console.log(`[MANA] 💰 DAO fee for tx ${txHash}: ${formatMana(amount)}`);
  }

  console.log(
    `[MANA] 🪙 Credits transfer: ${normalizedFrom} → ${normalizedTo}, amount: ${formatMana(
      amount
    )}`
  );

  // Check if we already have matching credit consumptions
  if (pendingCreditConsumptions.has(txHash)) {
    const creditConsumptions = pendingCreditConsumptions.get(txHash)!;
    if (creditConsumptions.length > 1) {
      console.log(
        `[MANA] Processing ${creditConsumptions.length} consumptions for tx ${txHash}`
      );
    }

    // Process each credit consumption
    for (const creditConsumption of creditConsumptions) {
      createManaTransaction(store, txHash, creditConsumption);
    }
  }
}

/**
 * Process a credit consumption event
 */
export async function registerCreditConsumption(
  store: Store,
  creditConsumption: CreditConsumption
): Promise<void> {
  const txHash = creditConsumption.txHash;
  const consumptionId = creditConsumption.id;

  // Initialize the array if it doesn't exist
  if (!pendingCreditConsumptions.has(txHash)) {
    pendingCreditConsumptions.set(txHash, []);
  }

  // Add this consumption to the array for this transaction
  const consumptions = pendingCreditConsumptions.get(txHash)!;

  // Check if this specific consumption is already in the array (avoid duplicates)
  const existingIndex = consumptions.findIndex((c) => c.id === consumptionId);
  if (existingIndex >= 0) {
    console.log(
      `[CREDITS] ERROR: Consumption ${consumptionId} already registered for tx ${txHash}, skipping`
    );
    return;
  }

  // Add to the array of consumptions for this transaction
  consumptions.push(creditConsumption);

  // Store the beneficiary address if we're already tracking this transaction
  if (pendingTransactions.has(txHash)) {
    const txData = pendingTransactions.get(txHash)!;
    const beneficiaryId = creditConsumption.beneficiary.id.toLowerCase();

    // Add to the array of beneficiaries if not already there
    if (!txData.creditBeneficiaries.includes(beneficiaryId)) {
      txData.creditBeneficiaries.push(beneficiaryId);
    }

    // Process this consumption immediately if we already have the transaction data
    await createManaTransaction(store, txHash, creditConsumption);
  } else {
    console.log(
      `[CREDITS] ⚠️ WARNING: No MANA transfer found yet for consumption in tx ${txHash}`
    );

    // Check if transaction already exists in database but was processed in a previous batch
    try {
      // Query with a prefix search for any transaction with this txHash
      const existingTransactions = await store.find(ManaTransaction, {
        where: { txHash },
      });

      if (existingTransactions.length > 0) {
        // Update each existing transaction with this consumption ID
        for (const existingTx of existingTransactions) {
          // Get existing relatedConsumptionIds or initialize an empty array
          const relatedIds = existingTx.relatedConsumptionIds || [];

          // Add this consumption ID if not already present
          if (!relatedIds.includes(consumptionId)) {
            relatedIds.push(consumptionId);
            existingTx.relatedConsumptionIds = relatedIds;

            // Update credit amount
            if (!existingTx.creditAmount) {
              existingTx.creditAmount = creditConsumption.amount;
            } else {
              existingTx.creditAmount += creditConsumption.amount;
            }

            // Save the updated transaction
            await store.save(existingTx);
            console.log(
              `[CREDITS] Updated transaction ${existingTx.id} with consumption ${consumptionId}`
            );

            // Remove this consumption from pending since it's been processed
            const updatedConsumptions = consumptions.filter(
              (c) => c.id !== consumptionId
            );
            if (updatedConsumptions.length === 0) {
              pendingCreditConsumptions.delete(txHash);
            } else {
              pendingCreditConsumptions.set(txHash, updatedConsumptions);
            }

            return; // Successfully processed this consumption
          }
        }
      }
    } catch (error) {
      console.error(
        `[CREDITS] ERROR: Failed to check for existing transactions: ${error}`
      );
    }
  }
}

/**
 * Create a ManaTransaction entity correlating MANA transfer with credit consumption
 */
export async function createManaTransaction(
  store: Store,
  txHash: string,
  creditConsumption?: CreditConsumption
): Promise<void> {
  // Get the transaction data
  const txData = pendingTransactions.get(txHash);
  if (!txData || txData.transfers.length === 0) {
    console.log(`[MANA] ERROR: No MANA transfers found for tx ${txHash}`);
    return;
  }

  // Add beneficiary from credit consumption if not already set
  if (
    creditConsumption &&
    !txData.creditBeneficiaries.includes(
      creditConsumption.beneficiary.id.toLowerCase()
    )
  ) {
    txData.creditBeneficiaries.push(
      creditConsumption.beneficiary.id.toLowerCase()
    );
  }

  // Get the main transfers (not DAO fees) sorted by amount
  const mainTransfers = txData.transfers
    .filter((t) => !t.isDaoFee)
    .sort((a, b) =>
      b.totalManaAmount > a.totalManaAmount
        ? 1
        : b.totalManaAmount < a.totalManaAmount
        ? -1
        : 0
    );

  if (mainTransfers.length === 0) {
    console.log(
      `[MANA] ERROR: Only found DAO fee transfers for tx ${txHash}, skipping`
    );
    return;
  }

  // The main transfer is usually the largest one from the credits contract
  const mainTransfer = mainTransfers[0];

  // Find any transfers from the beneficiary (user paid amount)
  let userPaidAmount = 0n;

  // Check all beneficiaries for this transaction
  if (txData.creditBeneficiaries.length > 0) {
    // Find all transfers from any of the beneficiaries
    const userTransfers = txData.transfers.filter((t) => {
      return txData.creditBeneficiaries.includes(t.fromAddress) && !t.isDaoFee;
    });

    userPaidAmount = userTransfers.reduce(
      (sum, t) => sum + t.totalManaAmount,
      0n
    );
  }

  // Generate a unique ID for the transaction
  const id = `${txHash}-${mainTransfer.logIndex}`;

  // Get or update existing transaction
  let manaTransaction: ManaTransaction | undefined;
  try {
    manaTransaction = await store.get(ManaTransaction, id);
  } catch (error) {
    if (!(error instanceof Error && error.message.includes("not found"))) {
      console.error(
        `[MANA] ERROR: Failed to check for existing transaction: ${error}`
      );
    }
  }

  // Initialize the related consumption IDs array
  let relatedConsumptionIds: string[] = [];

  // If transaction exists, get its existing consumption IDs
  if (manaTransaction) {
    relatedConsumptionIds = manaTransaction.relatedConsumptionIds || [];
  }

  // Add current consumption ID if provided and not already in the array
  if (
    creditConsumption &&
    !relatedConsumptionIds.includes(creditConsumption.id)
  ) {
    relatedConsumptionIds.push(creditConsumption.id);
  }

  // Always check for all consumptions in this transaction, even when processing individual consumption
  let creditAmount: bigint | null = null;

  if (pendingCreditConsumptions.has(txHash)) {
    // Sum up all credit consumptions for this transaction
    creditAmount = pendingCreditConsumptions
      .get(txHash)!
      .reduce((sum, consumption) => sum + consumption.amount, 0n);

    // Also add the current consumption if it's not in the pending list
    if (
      creditConsumption &&
      !pendingCreditConsumptions
        .get(txHash)!
        .some((c) => c.id === creditConsumption.id)
    ) {
      creditAmount += creditConsumption.amount;
    }
  } else if (creditConsumption) {
    // If we don't have any pending consumptions but have the current one
    creditAmount = creditConsumption.amount;
  }

  // Calculate total transaction amount
  const totalAmount = mainTransfer.totalManaAmount + txData.totalDaoFees;

  console.log(`[MANA] 💵 Transaction ${txHash} summary:`);
  console.log(`  - Total: ${formatMana(totalAmount)}`);
  console.log(`  - Main: ${formatMana(mainTransfer.totalManaAmount)}`);
  if (txData.totalDaoFees > 0)
    console.log(`  - DAO fees: ${formatMana(txData.totalDaoFees)}`);
  if (creditAmount) console.log(`  - Credits: ${formatMana(creditAmount)}`);
  if (userPaidAmount > 0)
    console.log(`  - User paid: ${formatMana(userPaidAmount)}`);
  console.log(`  - Consumptions: ${relatedConsumptionIds.length}`);

  // Create or update the entity
  if (!manaTransaction) {
    // Create new transaction
    manaTransaction = new ManaTransaction({
      id,
      txHash,
      fromAddress: mainTransfer.fromAddress,
      toAddress: mainTransfer.toAddress,
      totalManaAmount: mainTransfer.totalManaAmount,
      creditAmount,
      userPaidAmount: userPaidAmount > 0 ? userPaidAmount : null,
      daoFeeAmount: txData.totalDaoFees > 0 ? txData.totalDaoFees : null,
      relatedConsumptionIds,
      timestamp: txData.timestamp,
      block: txData.block,
    });
  } else {
    // Update existing transaction
    manaTransaction.totalManaAmount = mainTransfer.totalManaAmount;
    manaTransaction.creditAmount = creditAmount;
    manaTransaction.userPaidAmount = userPaidAmount > 0 ? userPaidAmount : null;
    manaTransaction.daoFeeAmount =
      txData.totalDaoFees > 0 ? txData.totalDaoFees : null;
    manaTransaction.relatedConsumptionIds = relatedConsumptionIds;
  }

  // Save to database
  try {
    await store.save(manaTransaction);

    // If this is a specific consumption, mark it as processed by removing from the pending list
    if (creditConsumption) {
      const consumptions = pendingCreditConsumptions.get(txHash) || [];
      const updatedConsumptions = consumptions.filter(
        (c) => c.id !== creditConsumption.id
      );

      if (updatedConsumptions.length === 0) {
        // If no more consumptions for this txHash, remove the entry
        pendingCreditConsumptions.delete(txHash);

        // Only remove from pendingTransactions if no more consumptions for this txHash
        pendingTransactions.delete(txHash);
      } else {
        // Otherwise update with the remaining consumptions
        pendingCreditConsumptions.set(txHash, updatedConsumptions);
      }
    }
  } catch (error) {
    console.error(`[MANA] ERROR: Failed to save transaction: ${error}`);
  }
}

/**
 * Process all pending correlations at the end of a batch
 */
export async function processPendingCorrelations(store: Store): Promise<void> {
  const txCount = pendingTransactions.size;

  // Calculate total pending consumptions
  let totalPendingConsumptions = 0;
  for (const consumptions of pendingCreditConsumptions.values()) {
    totalPendingConsumptions += consumptions.length;
  }

  const transferCount = Array.from(pendingTransactions.values()).reduce(
    (sum, tx) => sum + tx.transfers.length,
    0
  );

  if (txCount > 0 || totalPendingConsumptions > 0) {
    console.log(
      `[MANA] Processing ${txCount} pending transactions with ${transferCount} transfers and ${totalPendingConsumptions} pending consumptions`
    );
  } else {
    return; // Nothing to process
  }

  // Process all transactions with matching credit consumptions
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  // First, create a copy of all credit consumptions to prevent early removal
  const consumptionsByTx = new Map<string, CreditConsumption[]>();
  for (const [txHash, consumptions] of pendingCreditConsumptions.entries()) {
    consumptionsByTx.set(txHash, [...consumptions]);
  }

  // Create a copy of pendingTransactions to iterate through since we'll be modifying it
  const pendingTxEntries = Array.from(pendingTransactions.entries());

  // Process each transaction
  for (const [txHash, txData] of pendingTxEntries) {
    try {
      const consumptions = consumptionsByTx.get(txHash) || [];

      if (consumptions.length > 0) {
        // Process each credit consumption for this transaction
        if (consumptions.length > 1) {
          console.log(
            `[MANA] Processing ${consumptions.length} consumptions for tx ${txHash}`
          );
        }

        // Process each consumption one by one
        for (const consumption of consumptions) {
          await createManaTransaction(store, txHash, consumption);
          successCount++;
        }
      } else {
        // Also create transactions for unmatched transfers
        await createManaTransaction(store, txHash);
        skipCount++;
      }
    } catch (error) {
      console.error(
        `[MANA] ERROR: Failed to process correlation for tx ${txHash}: ${error}`
      );
      errorCount++;
    }
  }

  if (successCount > 0 || skipCount > 0 || errorCount > 0) {
    console.log(
      `[MANA] Correlation summary: ${successCount} processed, ${skipCount} skipped, ${errorCount} errors`
    );
  }

  // Add detailed logging for orphaned credit consumptions
  let remainingConsumptions = 0;
  for (const consumptions of pendingCreditConsumptions.values()) {
    remainingConsumptions += consumptions.length;
  }

  if (remainingConsumptions > 0) {
    console.log(
      `[MANA] ⚠️ WARNING: ${remainingConsumptions} orphaned consumptions detected - attempting recovery`
    );

    // Try to recover orphaned consumptions by checking for existing transactions in database
    let recoveredCount = 0;
    let stillOrphanedCount = 0;
    const orphanedConsumptionIds: string[] = [];

    // Process each remaining txHash with pending consumptions
    for (const [txHash, consumptions] of pendingCreditConsumptions.entries()) {
      // Try to find existing transactions in database for this txHash
      try {
        const existingTransactions = await store.find(ManaTransaction, {
          where: { txHash },
        });

        if (existingTransactions.length > 0) {
          // Update each transaction with these consumptions
          for (const consumption of consumptions) {
            let added = false;

            // Try to add to each existing transaction
            for (const existingTx of existingTransactions) {
              // Get existing relatedConsumptionIds or initialize an empty array
              const relatedIds = existingTx.relatedConsumptionIds || [];

              // Add this consumption ID if not already present
              if (!relatedIds.includes(consumption.id)) {
                relatedIds.push(consumption.id);
                existingTx.relatedConsumptionIds = relatedIds;

                // Update credit amount
                if (!existingTx.creditAmount) {
                  existingTx.creditAmount = consumption.amount;
                } else {
                  existingTx.creditAmount += consumption.amount;
                }

                // Save the updated transaction
                await store.save(existingTx);
                added = true;
                recoveredCount++;
                break; // Successfully added to this transaction, no need to try others
              }
            }

            // If couldn't add to any transaction, still orphaned
            if (!added) {
              orphanedConsumptionIds.push(consumption.id);
              stillOrphanedCount++;
            }
          }
        } else {
          // No existing transactions, all consumptions still orphaned
          for (const consumption of consumptions) {
            orphanedConsumptionIds.push(consumption.id);
            stillOrphanedCount++;
          }
        }
      } catch (error) {
        console.error(
          `[MANA] ERROR: Failed to check for existing transactions: ${error}`
        );

        // Count these as still orphaned
        for (const consumption of consumptions) {
          orphanedConsumptionIds.push(consumption.id);
          stillOrphanedCount++;
        }
      }
    }

    if (recoveredCount > 0 || stillOrphanedCount > 0) {
      console.log(
        `[MANA] Recovery summary: ${recoveredCount} recovered, ${stillOrphanedCount} still orphaned`
      );
    }

    if (stillOrphanedCount > 0) {
      // Only show first few IDs to avoid cluttering logs
      const displayIds = orphanedConsumptionIds.slice(0, 3);
      const remaining =
        orphanedConsumptionIds.length > 3
          ? `and ${orphanedConsumptionIds.length - 3} more`
          : "";
      console.log(
        `[MANA] 🚨 ERROR: Remaining orphaned consumptions: ${displayIds.join(
          ", "
        )} ${remaining}`
      );
    }

    // Clear remaining pending consumptions
    pendingCreditConsumptions.clear();
  }
}
