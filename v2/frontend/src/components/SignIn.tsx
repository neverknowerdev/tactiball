import { useEffect, useState } from 'react';
import type { SessionInfo, Settings } from '../bindings/backend';
import { api, errorText, ok } from '../lib/backend';
import { listWallets, personalSign, requestAddress, type WalletOption } from '../lib/wallet';

/**
 * Sign in with an EVM wallet on Base or Robinhood Chain. The wallet signs one
 * SIWE message; the canister checks it and starts a session for this browser.
 */
export function SignIn({ settings, onSignedIn }: { settings: Settings | null; onSignedIn: (s: SessionInfo) => void }) {
  const chains = (settings?.chains ?? []).filter((c) => c.enabled);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // EIP-6963 announcements arrive asynchronously.
    const t = setTimeout(() => setWallets(listWallets()), 300);
    setWallets(listWallets());
    return () => clearTimeout(t);
  }, []);

  const signIn = async (chainId: bigint, wallet: WalletOption) => {
    setError(null);
    setBusy(`${chainId}`);
    try {
      const address = await requestAddress(wallet);
      const prepared = ok(await api().auth_prepare({ address, chain_id: chainId, domain: window.location.host }));
      const signature = await personalSign(wallet, address, prepared.message);
      onSignedIn(ok(await api().auth_login(signature)));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card">
      <h2>Sign in</h2>
      <p className="muted">
        Use your wallet on Base or Robinhood Chain. You sign one message (no transaction, no gas) and then play without wallet popups.
      </p>
      {wallets.length === 0 && <p className="banner">No browser wallet found. Install MetaMask, Rabby or Coinbase Wallet, or open this page in your wallet's browser.</p>}
      {wallets.map((w) => (
        <div key={w.id} className="wallet-row">
          <span className="wallet-name">
            {w.icon && <img src={w.icon} alt="" />} {w.name}
          </span>
          <div className="row">
            {chains.map((c) => (
              <button key={String(c.chain_id)} disabled={!!busy} onClick={() => signIn(c.chain_id, w)}>
                {busy === `${c.chain_id}` ? 'Check your wallet…' : `Sign in on ${c.name}`}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error && <p className="error">{error}</p>}
      <p className="muted small">Smart wallets (Coinbase Smart Wallet, Base App) are not supported yet in this preview.</p>
    </section>
  );
}
