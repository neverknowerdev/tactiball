'use client';
import { MiniKitProvider } from '@worldcoin/minikit-js/minikit-provider';
import { ReactNode, useEffect, useState } from 'react';

export function WorldChainContextProvider({ children }: { children: ReactNode }) {
    const [isClient, setIsClient] = useState(false);

    // Ensure we're on the client side before rendering MiniKit
    useEffect(() => {
        setIsClient(true);
    }, []);

    // Don't render MiniKit provider on server side
    if (!isClient) {
        return <>{children}</>;
    }

    return (
        <MiniKitProvider>
            {children}
        </MiniKitProvider>
    );
}