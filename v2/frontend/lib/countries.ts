import countryList from '@/public/countryList.json';

const cache = new Map<number, string>();

export function countryName(index: number): string {
  return countryList.find((c) => c.index === index)?.name ?? `Country #${index}`;
}

/** Flag emoji for a country index from countryList.json (as in v1). */
export function countryFlag(index: number): string {
  const hit = cache.get(index);
  if (hit) return hit;
  const country = countryList.find((c) => c.index === index);
  const flag = country?.code
    ? String.fromCodePoint(...country.code.toUpperCase().split('').map((ch) => ch.charCodeAt(0) + 127397))
    : '🏳️';
  cache.set(index, flag);
  return flag;
}
