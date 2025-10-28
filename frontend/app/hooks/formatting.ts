// utils/formatting.ts

// Helper function to format ELO rating from 1000 format to 10.00 format
export const formatElo = (elo: number): string => {
  return (elo / 100).toFixed(2);
};