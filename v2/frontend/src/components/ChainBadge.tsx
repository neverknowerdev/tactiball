import type { Settings } from '../bindings/backend';
import { chainBadge } from '../lib/chains';

export function ChainBadge({ chain, settings }: { chain: string; settings: Settings | null }) {
  const b = chainBadge(chain, settings?.chains);
  return (
    <span className="chain-badge" style={{ background: b.color }} title={chain}>
      {b.label}
    </span>
  );
}
