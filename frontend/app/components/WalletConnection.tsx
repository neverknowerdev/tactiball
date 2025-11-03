"use client";

import { useMemo } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import {
    Name,
    Identity,
    Address,
    Avatar,
    EthBalance,
} from "@coinbase/onchainkit/identity";
import {
    ConnectWallet,
    Wallet,
    WalletDropdown,
    WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { DynamicWidget } from '@dynamic-labs/sdk-react-core';

function OnChainKitWallet() {
    return (
        <Wallet className="z-10">
            <ConnectWallet
                className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
                disconnectedLabel="Connect Wallet"
            >
                <Name className="text-white" />
            </ConnectWallet>
            <WalletDropdown>
                <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                    <Avatar />
                    <Name />
                    <Address />
                    <EthBalance />
                </Identity>
                <WalletDropdownDisconnect />
            </WalletDropdown>
        </Wallet>
    );
}

function DynamicWallet() {
    return (
        <div className="z-10">
            <DynamicWidget variant="modal" />
        </div>
    );
}

export function WalletConnection() {
    const { context } = useMiniKit();
    const isMiniApp = useMemo(() => {
        return context !== null && context !== undefined;
    }, [context]);

    return (
        <div className="absolute top-4 right-4 z-20">
            <div className="flex items-center space-x-2">
                {isMiniApp ? <OnChainKitWallet /> : <DynamicWallet />}
            </div>
        </div>
    );
}