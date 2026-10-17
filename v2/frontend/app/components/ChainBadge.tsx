import { chainBadge } from '@/lib/chains';

/** Small pill naming the chain a team's player signed up from. */
export function ChainBadge({ chain, className = '' }: { chain: string; className?: string }) {
  const b = chainBadge(chain);
  return (
    <span className={`inline-block align-middle whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${b.className} ${className}`} title={chain ? `Plays from ${b.label}` : 'Signed up with email'}>
      {b.label}
    </span>
  );
}
