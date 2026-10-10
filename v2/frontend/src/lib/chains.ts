import type { ChainConfig } from '../bindings/backend';

const STYLE: Record<string, { short: string; color: string }> = {
  '8453': { short: 'Base', color: '#0052ff' },
  '84532': { short: 'Base Sepolia', color: '#4d7cff' },
  '4663': { short: 'Robinhood', color: '#00c805' },
  '46630': { short: 'Robinhood Testnet', color: '#5cd65f' },
};

/** Badge label and color for a CAIP-2 chain id like "eip155:8453". */
export function chainBadge(caip2: string, chains: ChainConfig[] = []): { label: string; color: string } {
  const id = caip2.split(':')[1] ?? '';
  const style = STYLE[id];
  const configured = chains.find((c) => String(c.chain_id) === id);
  return {
    label: style?.short ?? configured?.name ?? caip2,
    color: style?.color ?? '#6b7280',
  };
}
