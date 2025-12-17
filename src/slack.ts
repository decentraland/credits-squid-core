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

export function getCrossChainCreditMessage(
  totalCreditsUsed: bigint,
  manaBridged: bigint,
  creditCount: number,
  polygonTxHash: string,
  ethereumTxHash: string | null | undefined,
  orderHash: string,
  squidStatus: string | null | undefined,
  timestamp: Date
) {
  const polygonscanUrl = `https://polygonscan.com/tx/${polygonTxHash}`;
  const etherscanUrl = ethereumTxHash
    ? `https://etherscan.io/tx/${ethereumTxHash}`
    : null;
  const coralScanUrl = getCoralScanUrl(polygonTxHash);

  return `🌉 *Cross-Chain Credit Usage Detected*

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
