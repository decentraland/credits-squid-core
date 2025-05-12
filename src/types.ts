export type ManaTransfer = {
  fromAddress: string;
  toAddress: string;
  totalManaAmount: bigint;
  timestamp: Date;
  block: number;
  logIndex: number;
  isDaoFee: boolean;
};
