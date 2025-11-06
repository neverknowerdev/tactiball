import React from "react";
import countryList from '../../public/countryList.json';

export function useCountryFlag() {
  const countryFlagCache = React.useMemo(() => new Map<number, string>(), []);

  const getCountryFlag = React.useCallback((countryIndex: number) => {
    // Check cache first
    if (countryFlagCache.has(countryIndex)) {
      return countryFlagCache.get(countryIndex)!;
    }

    // Find the country by index in the country list
    const country = countryList.find(c => c.index === countryIndex);

    if (country && country.code) {
      // Convert country code to flag emoji using Unicode regional indicator symbols
      const codePoints = country.code
        .toUpperCase()
        .split('')
        .map(char => char.charCodeAt(0) + 127397);

      const flag = String.fromCodePoint(...codePoints);
      countryFlagCache.set(countryIndex, flag);
      return flag;
    }

    // Fallback for invalid country index
    const fallback = `#${countryIndex}`;
    countryFlagCache.set(countryIndex, fallback);
    return fallback;
  }, [countryFlagCache]);

  return getCountryFlag;
}