import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { base } from "wagmi/chains";
import { baseAccount, BaseAccountParameters } from "wagmi/connectors";
import { farcasterMiniApp as miniAppConnector } from '@farcaster/miniapp-wagmi-connector'


export const baseAccountConfig: BaseAccountParameters = {
    appName: "ChessBall",
    appLogoUrl: 'https://play.chessball.fun/icon.png',
    subAccounts: {
        creation: 'on-connect',
        defaultAccount: "sub",
        funding: 'manual',
    },
    paymasterUrls: {
        [base.id]: process.env
            .NEXT_PUBLIC_COINBASE_PAYMASTER_RPC_URL as string,
    },
}

export function getConfig() {
    return createConfig({
        chains: [base],
        connectors: [
            baseAccount({
                appName: "ChessBall",
                appLogoUrl: 'https://play.chessball.fun/icon.png',
                subAccounts: {
                    creation: 'on-connect',
                    defaultAccount: "sub",
                    funding: 'manual',
                },
                paymasterUrls: {
                    [base.id]: process.env
                        .NEXT_PUBLIC_COINBASE_PAYMASTER_RPC_URL as string,
                },
            }),
            miniAppConnector(),
        ],
        storage: createStorage({
            storage: cookieStorage,
        }),
        ssr: true,
        transports: {
            [base.id]: http(),
        },
    });
}

declare module "wagmi" {
    interface Register {
        config: ReturnType<typeof getConfig>;
    }
}