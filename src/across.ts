/**
 * Across bridge API integration.
 * Resolves the destination-chain fill status of an Across deposit made on Polygon.
 *
 * Mirrors coral.ts (Squid) but for Across V4. The webapp uses the same endpoint
 * (/api/deposit/status?originChainId=137&depositTxHash=<polygonTxHash>); we reuse
 * the txHash form here since the indexer already has the source tx hash from the log.
 */

import { POLYGON_CHAIN_ID } from "./constants";

const ACROSS_API_URL = process.env.ACROSS_API_URL || "https://app.across.to/api";

// NOTE: Across has no reliable public per-deposit explorer page (the app's
// /transactions/<hash> route 404s — it's a wallet-gated SPA, and our depositor is the
// executor contract, not a user wallet). So the Slack message links the origin tx on
// Polygonscan instead; there is intentionally no Across-explorer link.

// Across deposit status values returned by /api/deposit/status.
// Treat this as the closed set of statuses we recognize as final or known. Unknown
// statuses from the API (e.g. a future "slow_fill") are NOT cast into this enum —
// see parseAcrossStatus below.
export enum AcrossDepositStatus {
  PENDING = "pending",
  FILLED = "filled",
  REFUNDED = "refunded",
  EXPIRED = "expired",
}

const KNOWN_ACROSS_STATUSES = new Set<string>(
  Object.values(AcrossDepositStatus) as string[]
);

/**
 * Parse a raw API status string into a known AcrossDepositStatus, returning the
 * raw string when unknown. The poller treats `string`-not-in-enum as non-final
 * (keeps polling), which is the safe behavior for a future status we haven't seen.
 */
function parseAcrossStatus(raw: string | undefined): AcrossDepositStatus | string {
  const s = (raw || "pending").toLowerCase();
  return KNOWN_ACROSS_STATUSES.has(s) ? (s as AcrossDepositStatus) : s;
}

interface AcrossStatusResponse {
  status?: string;
  // The destination fill tx is returned as `fillTx` / `fillTxnRef` (NOT `fillTxHash`).
  fillTx?: string;
  fillTxnRef?: string;
  depositTxHash?: string;
  // `actionsSucceeded` reports whether the embedded MulticallHandler actions
  // (approve + register + sweep) ran — i.e. whether the NAME was actually minted.
  // false ⇒ the deposit filled but the register reverted; bridged MANA went to recovery.
  actionsSucceeded?: boolean;
  depositRefundTxHash?: string | null;
}

/**
 * Fetch the status of an Across deposit by its Polygon (origin) transaction hash.
 * Returns the destination fill tx hash if the deposit has been filled, the normalized
 * status, and whether the destination actions (the register) succeeded.
 */
export async function fetchAcrossStatus(
  polygonTxHash: string,
  originChainId: string = POLYGON_CHAIN_ID
): Promise<{
  destinationTxHash: string | null;
  // Either a known AcrossDepositStatus, the raw string (unknown future status), or null on error.
  status: AcrossDepositStatus | string | null;
  // Whether the destination MulticallHandler actions (the register) succeeded. Defaults
  // to true unless the API explicitly reports false.
  actionsSucceeded: boolean;
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
      return { destinationTxHash: null, status: null, actionsSucceeded: false };
    }

    const data: AcrossStatusResponse = await response.json();
    const status = parseAcrossStatus(data.status);
    const fillTx = data.fillTx || data.fillTxnRef || null;
    const actionsSucceeded = data.actionsSucceeded !== false;

    console.log(
      `[ACROSS] Status: ${status}, fillTx: ${fillTx || "pending"}, actionsSucceeded: ${actionsSucceeded}`
    );

    // A fill tx means delivered. Refunds/expiries are terminal failures with no fill.
    return {
      destinationTxHash: fillTx,
      status,
      actionsSucceeded,
    };
  } catch (error) {
    console.error(
      `[ACROSS] ❌ Failed to fetch status for tx ${polygonTxHash}:`,
      error
    );
    return { destinationTxHash: null, status: null, actionsSucceeded: false };
  }
}
