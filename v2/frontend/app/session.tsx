'use client';

// Wallet sign-in against the canister.
//
// Connecting a wallet shows the player's team right away (`team_by_wallet`
// is a public query). The first action that changes something asks the
// wallet to sign a Sign-In with Ethereum message once; after that, calls are
// signed by the browser's session key until the session expires (3 days by
// default), so playing needs no more wallet popups.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAccount, useSignMessage, useSwitchChain } from 'wagmi';
import { api, errorText, ok, resetSessionKey, type SessionInfo, type Settings, type TeamView } from '@/lib/backend';
import { loadEngine } from '@/lib/engine';
import { chainName } from '@/lib/chains';

interface SessionState {
  settings: Settings | null;
  address?: `0x${string}`;
  isConnected: boolean;
  /** The connected wallet's team, signed in or not. */
  team: TeamView | null;
  teamLoading: boolean;
  /** Set once the wallet has signed in for this browser. */
  session: SessionInfo | null;
  /** Signs in if needed (one wallet signature) and returns the session. */
  ensureSignedIn: () => Promise<SessionInfo>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

const identityOf = (address: string) => `eip155:${address.toLowerCase()}`;

export function SessionProvider({ children }: { children: ReactNode }) {
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [team, setTeam] = useState<TeamView | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signingIn = useRef<Promise<SessionInfo> | null>(null);

  useEffect(() => {
    loadEngine().catch((e) => setError(`Game engine failed to load: ${errorText(e)}`));
    (async () => setSettings(await api().get_settings()))().catch((e) => setError(`Cannot reach the game server: ${errorText(e)}`));
  }, []);

  const refresh = useCallback(async () => {
    if (!address) {
      setSession(null);
      setTeam(null);
      return;
    }
    setTeamLoading(true);
    try {
      const [who, byWallet] = await Promise.all([api().whoami(), api().team_by_wallet(address)]);
      // A session belongs to whichever wallet signed in; ignore it if the
      // user switched to a wallet that is not linked to that account.
      const mine = who && who.user.identities.includes(identityOf(address)) ? who : null;
      setSession(mine);
      setTeam(mine?.team ?? ok(byWallet) ?? null);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setTeamLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const ensureSignedIn = useCallback(async (): Promise<SessionInfo> => {
    if (session) return session;
    if (!address || !settings) throw new Error('Connect your wallet first');
    if (signingIn.current) return signingIn.current;

    const run = async () => {
      const enabled = settings.chains.filter((c) => c.enabled).map((c) => Number(c.chain_id));
      let useChain = chainId && enabled.includes(chainId) ? chainId : enabled[0];
      if (useChain === undefined) throw new Error('No sign-in chain is enabled');
      if (useChain !== chainId) {
        try {
          await switchChainAsync({ chainId: useChain });
        } catch {
          throw new Error(`Switch your wallet to ${enabled.map(chainName).join(' or ')} to sign in`);
        }
      }
      const prepared = ok(await api().auth_prepare({ address, chain_id: BigInt(useChain), domain: window.location.host }));
      const signature = await signMessageAsync({ message: prepared.message });
      const info = ok(await api().auth_login(signature));
      setSession(info);
      setTeam(info.team ?? null);
      return info;
    };
    signingIn.current = run().finally(() => {
      signingIn.current = null;
    });
    return signingIn.current;
  }, [session, address, settings, chainId, switchChainAsync, signMessageAsync]);

  const signOut = useCallback(async () => {
    try {
      await api().sign_out();
    } catch {
      // The session key is dropped below either way.
    }
    resetSessionKey();
    setSession(null);
  }, []);

  // Wallet switched or disconnected: drop a session that isn't this wallet's.
  useEffect(() => {
    if (session && (!address || !session.user.identities.includes(identityOf(address)))) setSession(null);
  }, [address, session]);

  const value = useMemo<SessionState>(
    () => ({ settings, address, isConnected, team, teamLoading, session, ensureSignedIn, refresh, signOut, error }),
    [settings, address, isConnected, team, teamLoading, session, ensureSignedIn, refresh, signOut, error],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
