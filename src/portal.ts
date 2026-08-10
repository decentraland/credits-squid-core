const SHARED_PORTAL_HOST = "https://shared.portal.sqd.dev";
const PUBLIC_PORTAL_HOST = "https://portal.sqd.dev";

/**
 * The SQD Network Portal stream this squid ingests from.
 *
 * Prefers the SHARED portal over the public one. The shared endpoint is authenticated and raises
 * the per-query size cap (the public one rejects anything over 256 KiB with `400 Query is too
 * large`, which is what stalled the marketplace squid's Polygon reindex). This squid's filters are
 * small, so the cap is not the reason here — the shared endpoint is simply the one with capacity:
 * the public stream intermittently answers `503 No available workers to serve the request`.
 *
 * Falls back to the public endpoint when no key is configured, so a deployment whose environment
 * does not map the key yet keeps ingesting instead of crash-looping on boot.
 *
 * The host is overridable because this endpoint has already moved once: a replacement should not
 * require shipping new code. The key is env-only and must never be committed.
 */
export function portalSource(dataset: string): {
  url: string;
  http: { headers?: Record<string, string>; retryAttempts: number };
} {
  // SQD_PORTAL_API_KEY is the Portal key (SSM `ops-param-sqd-portal-api-key`). SQUID_API_KEY is a
  // DIFFERENT product's key (the v2 archive) that happened to hold a Portal key during the
  // migration; it is only read as a fallback and should not be relied on.
  const apiKey = process.env.SQD_PORTAL_API_KEY || process.env.SQUID_API_KEY;
  const host =
    process.env.SQD_PORTAL_URL || (apiKey ? SHARED_PORTAL_HOST : PUBLIC_PORTAL_HOST);

  if (!apiKey) {
    console.log(
      "[portal] No SQD_PORTAL_API_KEY set: falling back to the public Portal endpoint, which is rate limited and caps queries at 256 KiB"
    );
  }

  return {
    url: `${host}/datasets/${dataset}`,
    http: {
      ...(apiKey ? { headers: { "x-api-key": apiKey } } : {}),
      // Portal answers a transient 503 when no worker is free; retrying forever keeps the
      // processor alive across those instead of exiting and relying on the container restart.
      retryAttempts: Infinity,
    },
  };
}
