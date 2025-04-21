import { App } from "@slack/bolt";
import { Store } from "@subsquid/typeorm-store";
import { ethers } from "ethers";
import { EntityManager } from "typeorm";

export interface ISlackComponent {
  sendMessage(channel: string, message: string): Promise<any>;
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

  function sendMessage(
    channel: string,
    message: string
  ): ReturnType<typeof app.client.chat.postMessage> {
    return app.client.chat.postMessage({
      channel,
      text: message,
    });
  }

  return {
    sendMessage,
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
• Credit ID: \`${salt}\`
• Beneficiary: \`${sender}\`
• Amount: \`${ethers.formatEther(value)}\` MANA
• Block: \`${block}\`
• Tx Hash: \`${transactionHash}\`
• Time: \`${timestamp.toISOString()}\``;
}
