/**
 * Coral/Squid Router API integration
 * Handles fetching cross-chain transaction status from Squid Router
 */

// Squid Router API configuration
const SQUID_ROUTER_API_URL =
  process.env.SQUID_ROUTER_API_URL || "https://v2.api.squidrouter.com";
const SQUID_INTEGRATOR_ID = process.env.SQUID_INTEGRATOR_ID || "";

// Chain IDs
export const POLYGON_CHAIN_ID = "137";
export const ETHEREUM_CHAIN_ID = "1";

// Coral Scan URL
export const CORAL_SCAN_BASE_URL = "https://coralscan.squidrouter.com/tx";

// Squid transaction status types
export enum SquidTransactionStatus {
  SUCCESS = "success",
  NEEDS_GAS = "needs_gas",
  ONGOING = "ongoing",
  PARTIAL_SUCCESS = "partial_success",
  NOT_FOUND = "not_found",
  REFUND_STATUS = "refund",
}

export interface SquidStatusResponse {
  id: string;
  status: string;
  gasStatus: string;
  isGMPTransaction: boolean;
  squidTransactionStatus: SquidTransactionStatus;
  axelarTransactionUrl: string;
  fromChain: {
    transactionId: string;
    blockNumber: string;
    callEventStatus: string;
    callEventLog: any[];
    chainData: any;
    transactionUrl: string;
  };
  toChain: {
    transactionId: string;
    blockNumber: string;
    callEventStatus: string;
    callEventLog: any[];
    chainData: any;
    transactionUrl: string;
  };
  timeSpent: {
    total: number;
  };
  routeStatus: Array<{
    chainId: string;
    txHash: string;
    status: string;
    action: string;
  }>;
  error?: any;
  requestId?: string;
  integratorId?: string;
}

/**
 * Fetch the status of a cross-chain transaction from Squid Router API
 * Returns the destination chain (Ethereum) transaction hash if available
 */
export async function fetchSquidStatus(
  polygonTxHash: string,
  fromChainId: string = POLYGON_CHAIN_ID,
  toChainId: string = ETHEREUM_CHAIN_ID
): Promise<{
  destinationTxHash: string | null;
  status: SquidTransactionStatus | null;
}> {
  try {
    const queryParams = new URLSearchParams({
      transactionId: polygonTxHash,
      fromChainId,
      toChainId,
    });

    const url = `${SQUID_ROUTER_API_URL}/v2/status?${queryParams.toString()}`;

    console.log(
      `[CORAL] Fetching status for tx: ${polygonTxHash.slice(0, 18)}...`
    );

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-integrator-id": SQUID_INTEGRATOR_ID,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(
        `[CORAL] ❌ Error fetching status: ${
          errorData.error || response.statusText
        }`
      );
      return { destinationTxHash: null, status: null };
    }

    const data: SquidStatusResponse = await response.json();

    console.log(
      `[CORAL] Status: ${data.squidTransactionStatus}, toChain txId: ${
        data.toChain?.transactionId || "pending"
      }`
    );

    return {
      destinationTxHash: data.toChain?.transactionId || null,
      status: data.squidTransactionStatus,
    };
  } catch (error) {
    console.error(
      `[CORAL] ❌ Failed to fetch status for tx ${polygonTxHash}:`,
      error
    );
    return { destinationTxHash: null, status: null };
  }
}

/**
 * Build the Coral Scan URL for a transaction
 */
export function getCoralScanUrl(txHash: string): string {
  return `${CORAL_SCAN_BASE_URL}/${txHash}`;
}
