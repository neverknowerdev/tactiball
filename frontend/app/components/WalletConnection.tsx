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

export function WalletConnection() {
    return (
        <div className="absolute top-4 right-4 z-20">
            <div className="flex items-center space-x-2">
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
            </div>
        </div>
    );
}