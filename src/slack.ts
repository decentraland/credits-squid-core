import { App } from "@slack/bolt";
import { Store } from "@subsquid/typeorm-store";
import { ethers } from "ethers";
import { EntityManager } from "typeorm";
import { getCoralScanUrl } from "./coral";

export interface SlackMessageResponse {
  ok: boolean;
  ts?: string;
  channel?: string;
}

export interface ISlackComponent {
  sendMessage(channel: string, message: string): Promise<SlackMessageResponse>;
  updateMessage(channel: string, ts: string, message: string): Promise<SlackMessageResponse>;
  app: App;
}

export async function createSlackComponent(config: {
  botToken: string;
  signingSecret: string;
}): Promise<ISlackComponent> {
  // Initialize app
  const app = new App({
    token: config.botToken,
    signingSecret: config.signingSecret,
  });

  async function sendMessage(
    channel: string,
    message: string
  ): Promise<SlackMessageResponse> {
    const result = await app.client.chat.postMessage({
      channel,
      text: message,
    });
    return { ok: result.ok ?? false, ts: result.ts, channel: result.channel };
  }

  async function updateMessage(
    channel: string,
    ts: string,
    message: string
  ): Promise<SlackMessageResponse> {
    const result = await app.client.chat.update({
      channel,
      ts,
      text: message,
    });
    return { ok: result.ok ?? false, ts: result.ts, channel: result.channel };
  }

  return {
    sendMessage,
    updateMessage,
    app,
  };
}

export async function getLastNotified(store: Store): Promise<bigint | null> {
  const em = (store as unknown as { em: () => EntityManager }).em();
  const lastNotified = (
    await em.query(
      "SELECT last_notified FROM public.squids WHERE name = 'credits'"
    )
  )[0].last_notified;
  return lastNotified && BigInt(lastNotified);
}

export async function setLastNotified(store: Store, timestamp: bigint) {
  const em = (store as unknown as { em: () => EntityManager }).em();
  await em.query(
    `UPDATE public.squids SET last_notified = ${timestamp} WHERE name = 'credits'`
  );
}

export function getCreditUsedMessage(
  salt: string,
  sender: string,
  value: bigint,
  block: number,
  transactionHash: string,
  timestamp: Date
) {
  return `🔔 *New Credit Consumption*
• Beneficiary: \`${sender}\`
• Amount: \`${ethers.formatEther(value)}\` MANA
• Block: \`${block}\`
• Tx Hash: \`${transactionHash}\`
• Time: \`${timestamp.toISOString()}\``;
}

// Squid statuses that indicate the cross-chain bridge did not deliver normally.
// PARTIAL_SUCCESS / REFUND / NEEDS_GAS all consume credits on Polygon without producing the expected outcome on Ethereum.
const ERROR_SQUID_STATUSES = new Set([
  "partial_success",
  "refund",
  "needs_gas",
]);

function isErrorStatus(status: string | null | undefined): boolean {
  return !!status && ERROR_SQUID_STATUSES.has(status);
}

// Slack subteam (user group) handle for the core team.
// Set CORETEAM_SLACK_GROUP_ID to the subteam ID (e.g. "S0123ABCD") so the mention pings real members.
// If unset, falls back to plain "@coreteam" text — visible but non-pinging.
function coreTeamMention(): string {
  const groupId = process.env.CORETEAM_SLACK_GROUP_ID;
  return groupId ? `<!subteam^${groupId}|@coreteam>` : "@coreteam";
}

export function getCrossChainCreditMessage(
  totalCreditsUsed: bigint,
  manaBridged: bigint,
  creditCount: number,
  polygonTxHash: string,
  ethereumTxHash: string | null | undefined,
  orderHash: string,
  squidStatus: string | null | undefined,
  timestamp: Date,
  beneficiary: string,
  options: { isStalled?: boolean; executorAddress?: string } = {}
) {
  const polygonscanUrl = `https://polygonscan.com/tx/${polygonTxHash}`;
  const etherscanUrl = ethereumTxHash
    ? `https://etherscan.io/tx/${ethereumTxHash}`
    : null;
  const coralScanUrl = getCoralScanUrl(polygonTxHash);

  const isError = options.isStalled || isErrorStatus(squidStatus);

  const header = isError
    ? `🚨 *Cross-Chain Credit FAILED* — ${coreTeamMention()}`
    : `🌉 *Cross-Chain Credit Usage Detected*`;

  const stalledNote = options.isStalled
    ? `\n*⚠️ Polling timed out before destination tx was observed.*\n`
    : "";

  // Only surface the executor when it differs from the beneficiary;
  // otherwise it's noise.
  const executorLine =
    options.executorAddress &&
    options.executorAddress.toLowerCase() !== beneficiary.toLowerCase()
      ? `\n*Executor:* \`${options.executorAddress}\``
      : "";

  return `${header}
${stalledNote}
*User:* \`${beneficiary}\`${executorLine}
*Credits Used:* \`${creditCount}\` credits (\`${ethers.formatEther(
    totalCreditsUsed
  )}\` MANA)
*WETH Bridged:* \`${ethers.formatEther(manaBridged)}\` WETH

*Order Hash:* \`${orderHash.slice(0, 18)}...\`
*Squid Status:* \`${squidStatus || "unknown"}\`

*Polygon Tx:* <${polygonscanUrl}|View on Polygonscan>
*Ethereum Tx:* ${
    etherscanUrl ? `<${etherscanUrl}|View on Etherscan>` : "_Pending..._"
  }
*Coral Scan:* <${coralScanUrl}|View on CoralScan>

*Time:* \`${timestamp.toISOString()}\``;
}
