// Minimal EVM wallet access through EIP-1193 providers, discovered with
// EIP-6963 (MetaMask, Rabby, Coinbase Wallet extension, Robinhood Wallet's
// browser, ...). The wallet only signs one sign-in message; no chain RPC is
// needed, so the wallet does not have to be on the chosen network.

import { toHex } from 'viem';

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface WalletOption {
  id: string;
  name: string;
  icon?: string;
  provider: Eip1193Provider;
}

const discovered = new Map<string, WalletOption>();

if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (event: Event) => {
    const detail = (event as CustomEvent).detail as { info: { uuid: string; name: string; icon: string; rdns: string }; provider: Eip1193Provider };
    discovered.set(detail.info.rdns || detail.info.uuid, { id: detail.info.rdns || detail.info.uuid, name: detail.info.name, icon: detail.info.icon, provider: detail.provider });
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

export function listWallets(): WalletOption[] {
  const list = [...discovered.values()];
  const injected = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (list.length === 0 && injected) {
    list.push({ id: 'injected', name: 'Browser wallet', provider: injected });
  }
  return list;
}

export async function requestAddress(wallet: WalletOption): Promise<string> {
  const accounts = (await wallet.provider.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts?.length) throw new Error('The wallet did not share an address');
  return accounts[0];
}

export async function personalSign(wallet: WalletOption, address: string, message: string): Promise<string> {
  return (await wallet.provider.request({ method: 'personal_sign', params: [toHex(message), address] })) as string;
}
