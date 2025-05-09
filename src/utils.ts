/**
 * Format Wei value to MANA (ETH format)
 * @param wei The amount in wei
 * @returns Formatted string with wei value and MANA equivalent
 */
export function formatMana(wei: bigint): string {
  const mana = Number(wei) / 1e18;
  return `${wei.toString()} wei (${mana.toFixed(2)} MANA)`;
}

/**
 * Format an Ethereum address
 * @param address The Ethereum address
 * @param trimmed Whether to trim the address (default: false)
 * @returns Formatted address
 */
export function formatAddress(address: string, trimmed: boolean = false): string {
  if (!address) return '';
  
  if (trimmed) {
    return `${address.substring(0, 8)}...${address.substring(address.length - 6)}`;
  }
  
  return address;
} 