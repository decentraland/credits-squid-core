/**
 * Across bridge API integration.
 * Resolves the destination-chain fill status of an Across deposit made on Polygon.
 *
 * Mirrors coral.ts (Squid) but for Across V4. The webapp uses the same endpoint
 * (/api/deposit/status?originChainId=137&depositTxHash=<polygonTxHash>); we reuse
 * the txHash form here since the indexer already has the source tx hash from the log.
 */

const ACROSS_API_URL = process.env.ACROSS_API_URL || "https://app.across.to/api";

export const POLYGON_CHAIN_ID = "137";

// Across explorer base URL for a deposit's source transaction.
export const ACROSS_SCAN_BASE_URL = "https://app.across.to/transactions";

// Across deposit status values returned by /api/deposit/status.
export enum AcrossDepositStatus {
  PENDING = "pending",
  FILLED = "filled",
  REFUNDED = "refunded",
  EXPIRED = "expired",
}

interface AcrossStatusResponse {
  status?: string;
  fillTxHash?: string;
  depositTxHash?: string;
  refundTxHash?: string;
  // Across also returns deposit metadata; we only consume the fields above.
}

/**
 * Fetch the status of an Across deposit by its Polygon (origin) transaction hash.
 * Returns the destination fill tx hash if the deposit has been filled, plus the
 * normalized status string.
 */
export async function fetchAcrossStatus(
  polygonTxHash: string,
  originChainId: string = POLYGON_CHAIN_ID
): Promise<{
  destinationTxHash: string | null;
  status: AcrossDepositStatus | null;
}> {
  try {
    const queryParams = new URLSearchParams({
      originChainId,
      depositTxHash: polygonTxHash,
    });

    const url = `${ACROSS_API_URL}/deposit/status?${queryParams.toString()}`;

    console.log(
      `[ACROSS] Fetching status for tx: ${polygonTxHash.slice(0, 18)}...`
    );

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      console.error(
        `[ACROSS] ❌ Error fetching status: ${response.status} ${response.statusText}`
      );
      return { destinationTxHash: null, status: null };
    }

    const data: AcrossStatusResponse = await response.json();
    const status = (data.status || "pending").toLowerCase() as AcrossDepositStatus;

    console.log(
      `[ACROSS] Status: ${status}, fillTx: ${data.fillTxHash || "pending"}`
    );

    // A fill tx hash means delivered. Refunds/expiries are terminal failures with no fill.
    return {
      destinationTxHash: data.fillTxHash || null,
      status,
    };
  } catch (error) {
    console.error(
      `[ACROSS] ❌ Failed to fetch status for tx ${polygonTxHash}:`,
      error
    );
    return { destinationTxHash: null, status: null };
  }
}

/**
 * Build the Across explorer URL for a source transaction.
 */
export function getAcrossScanUrl(txHash: string): string {
  return `${ACROSS_SCAN_BASE_URL}/${txHash}`;
}
