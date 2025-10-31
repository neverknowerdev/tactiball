import { useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

export function useAddMiniApp(isFrameReady: boolean) {
  useEffect(() => {
    const promptAddMiniApp = async () => {
      if (isFrameReady) {
        try {
          await sdk.actions.addMiniApp();
        } catch (error) {
          console.error('Failed to add mini app:', error);
        }
      }
    };

    promptAddMiniApp();
  }, [isFrameReady]);
}