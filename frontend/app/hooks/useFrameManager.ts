import { useEffect } from 'react';

export function useFrameManager(
  setFrameReady: () => void,
  isFrameReady: boolean
) {
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);
}