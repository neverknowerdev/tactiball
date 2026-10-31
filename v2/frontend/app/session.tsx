'use client';

// Sign-in against the canister, with a wallet or with email and password.
//
// Either way, the canister binds the browser's session key to the player's
// account, and calls are then signed by that key until the session expires
// (3 days by default), so playing needs no more wallet popups or passwords.
//
// Wallet: connecting shows the wallet's team right away (`team_by_wallet` is
// a public query). The first action that changes something asks the wallet
// to sign a Sign-In with Ethereum message once.
//
// Email: sign up or log in with email and password; no wallet needed.
//
// One account can have both: a wallet account can add an email login, and an
// email account can link a wallet.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAccount, useSignMessage, useSwitchChain } from 'wagmi';
import { api, errorText, ok, resetSessionKey, type SessionInfo, type Settings, type TeamView } from '@/lib/backend';
import { loadEngine } from '@/lib/engine';
import { chainName } from '@/lib/chains';
import { normalizeEmail, passwordKey } from '@/lib/password';

export type EmailMode = 'login' | 'signup';

interface SessionState {
  settings: Settings | null;
  /** The connected wallet, if any. */
  address?: `0x${string}`;
  isConnected: boolean;
  /** The player's team: the signed-in account's, else the connected wallet's. */
  team: TeamView | null;
  teamLoading: boolean;
  /** Set once the player has signed in on this browser. */
  session: SessionInfo | null;
  /** The signed-in account's email login, if it has one. */
  email: string | null;
  /** True when a wallet is connected that the signed-in account hasn't linked. */
  walletUnlinked: boolean;
  /** Signs in with the connected wallet if needed (one signature) and returns the session. */
  ensureSignedIn: () => Promise<SessionInfo>;
  /**
   * Forgets a wallet sign-in that is still waiting, so the next attempt asks
   * again. Wallets such as MetaMask can leave a request pending forever when
   * their popup is closed.
   */
  cancelSignIn: () => void;
  signInWithEmail: (mode: EmailMode, email: string, password: string) => Promise<SessionInfo>;
  /** Adds an email login to the signed-in account. */
  linkEmail: (email: string, password: string) => Promise<void>;
  /** Links the connected wallet to the signed-in account (one signature). */
  linkWallet: () => Promise<void>;
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

const walletIdentity = (address: string) => `eip155:${address.toLowerCase()}`;
const wallets = (s: SessionInfo) => s.user.identities.filter((i) => i.startsWith('eip155:'));
const emailOf = (s: SessionInfo | null) => s?.user.identities.find((i) => i.startsWith('email:'))?.slice('email:'.length) ?? null;

/**
 * A session stays in use while the connected wallet belongs to it. When the
 * player switches to a wallet the account doesn't have, the wallet wins (as
 * in v1), unless the account has no wallets at all (an email account).
 */
/** `session_expires_at` is in nanoseconds, like every canister timestamp. */
function isExpired(s: SessionInfo): boolean {
  return s.session_expires_at <= BigInt(Date.now()) * 1_000_000n;
}

function sessionForWallet(s: SessionInfo | null, address?: string): SessionInfo | null {
  if (!s || !address) return s;
  const linked = wallets(s);
  return linked.length === 0 || linked.includes(walletIdentity(address)) ? s : null;
}

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
  const signInGeneration = useRef(0);
  // Calls that change who the session principal is signed in as run one at a
  // time, in the order they were started (see serializeAuth).
  const authQueue = useRef<Promise<unknown>>(Promise.resolve());
  // The wallet address `team` was looked up for, so the auto sign-in below
  // never acts on a lookup that belongs to a previous wallet.
  const teamFor = useRef<string | undefined>(undefined);
  const autoSignInTried = useRef(false);

  useEffect(() => {
    loadEngine().catch((e) => setError(`Game engine failed to load: ${errorText(e)}`));
    (async () => setSettings(await api().get_settings()))().catch((e) => setError(`Cannot reach the game server: ${errorText(e)}`));
  }, []);

  const refresh = useCallback(async () => {
    setTeamLoading(true);
    try {
      const [who, byWallet] = await Promise.all([api().whoami(), address ? api().team_by_wallet(address) : null]);
      const mine = sessionForWallet(who, address);
      setSession(mine);
      setTeam(mine ? (mine.team ?? null) : byWallet ? (ok(byWallet) ?? null) : null);
      teamFor.current = address;
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

  const accept = useCallback((info: SessionInfo) => {
    setSession(info);
    setTeam(info.team ?? null);
    return info;
  }, []);

  /** Switches the wallet to a sign-in chain if needed and returns that chain. */
  const signInChain = useCallback(async (): Promise<number> => {
    if (!settings) throw new Error('Still connecting to the game server');
    const enabled = settings.chains.filter((c) => c.enabled).map((c) => Number(c.chain_id));
    const useChain = chainId && enabled.includes(chainId) ? chainId : enabled[0];
    if (useChain === undefined) throw new Error('No sign-in chain is enabled');
    if (useChain !== chainId) {
      try {
        await switchChainAsync({ chainId: useChain });
      } catch {
        throw new Error(`Switch your wallet to ${enabled.map(chainName).join(' or ')} to sign in`);
      }
    }
    return useChain;
  }, [settings, chainId, switchChainAsync]);

  // Open tabs share the session key (it lives in localStorage), so the queue
  // is also a Web Lock: one sign-in call at a time across all tabs. Without
  // Web Locks it falls back to this tab only.
  const serializeAuth = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const locked = () => (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('tactiball-auth', task) : task());
    const run = authQueue.current.then(locked, locked);
    authQueue.current = run.catch(() => {});
    return run;
  }, []);

  const ensureSignedIn = useCallback(async (): Promise<SessionInfo> => {
    if (session && !isExpired(session)) return session;
    if (!address) throw new Error('Sign in first');
    if (signingIn.current) return signingIn.current;

    // Cancelling, or signing in another way, bumps the generation; a stale
    // attempt must not change the challenge or the login under our principal.
    const generation = ++signInGeneration.current;
    const stale = () => generation !== signInGeneration.current;
    const cancelled = () => new Error('Wallet request cancelled.');
    const run = async () => {
      const useChain = await signInChain();
      const prepared = await serializeAuth(async () => {
        if (stale()) throw cancelled();
        return ok(await api().auth_prepare({ address, chain_id: BigInt(useChain), domain: window.location.host }));
      });
      // Cancelled while the challenge was on its way: don't open the wallet.
      if (stale()) throw cancelled();
      const signature = await signMessageAsync({ message: prepared.message });
      const info = await serializeAuth(async () => {
        if (stale()) throw cancelled();
        const info = ok(await api().auth_login(signature));
        if (stale()) {
          // Cancelled while the login was in flight: undo it before any
          // newer sign-in queued behind this one runs.
          await api().sign_out().catch(() => {});
          throw cancelled();
        }
        return info;
      });
      if (stale()) throw cancelled();
      return accept(info);
    };
    const attempt: Promise<SessionInfo> = run().finally(() => {
      // A cancelled attempt that settles late must not clear a newer one.
      if (signingIn.current === attempt) signingIn.current = null;
    });
    signingIn.current = attempt;
    return attempt;
  }, [session, address, signInChain, signMessageAsync, accept, serializeAuth]);

  const cancelSignIn = useCallback(() => {
    signInGeneration.current++;
    signingIn.current = null;
  }, []);

  const signInWithEmail = useCallback(
    async (mode: EmailMode, email: string, password: string): Promise<SessionInfo> => {
      cancelSignIn();
      const creds = { email: normalizeEmail(email), password_key: await passwordKey(email, password) };
      const result = await serializeAuth(() => (mode === 'signup' ? api().auth_email_sign_up(creds) : api().auth_email_login(creds)));
      return accept(ok(result));
    },
    [accept, cancelSignIn, serializeAuth],
  );

  const linkEmail = useCallback(
    async (email: string, password: string) => {
      ok(await api().auth_link_email({ email: normalizeEmail(email), password_key: await passwordKey(email, password) }));
      await refresh();
    },
    [refresh],
  );

  const linkWallet = useCallback(async () => {
    if (!address) throw new Error('Connect a wallet first');
    const useChain = await signInChain();
    const prepared = ok(await serializeAuth(() => api().auth_prepare_link({ address, chain_id: BigInt(useChain), domain: window.location.host })));
    const signature = await signMessageAsync({ message: prepared.message });
    ok(await serializeAuth(() => api().auth_link(signature)));
    await refresh();
  }, [address, signInChain, signMessageAsync, refresh, serializeAuth]);

  const signOut = useCallback(async () => {
    cancelSignIn();
    try {
      await serializeAuth(() => api().sign_out());
    } catch {
      // The session key is dropped below either way.
    }
    resetSessionKey();
    setSession(null);
    setTeam(null);
    await refresh();
  }, [refresh, cancelSignIn, serializeAuth]);

  // A connected wallet that already has a team is signed in right away: one
  // signature request per page load. If the player rejects it, the next
  // action that needs a session asks again.
  useEffect(() => {
    if (session || !team || !address || !settings || teamLoading || teamFor.current !== address || autoSignInTried.current) return;
    autoSignInTried.current = true;
    ensureSignedIn().catch(() => {});
  }, [session, team, address, settings, teamLoading, ensureSignedIn]);

  // The session ran out while the tab was open: re-read it (the canister now
  // reports no session) so the UI asks to sign in again, and let a connected
  // wallet with a team ask for its signature once more.
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const ms = Number(session.session_expires_at / 1_000_000n) - Date.now();
      // setTimeout overflows past ~24.8 days; longer sessions check again then.
      timer = setTimeout(check, Math.min(Math.max(ms, 0) + 1000, 2 ** 31 - 1));
    };
    const check = () => {
      if (!isExpired(session)) return arm();
      autoSignInTried.current = false;
      setSession(null);
      refresh();
    };
    arm();
    return () => clearTimeout(timer);
  }, [session, refresh]);

  // Wallet switched: drop a session that isn't this wallet's.
  useEffect(() => {
    if (session && !sessionForWallet(session, address)) setSession(null);
  }, [address, session]);

  const email = emailOf(session);
  const walletUnlinked = Boolean(session && address && !wallets(session).includes(walletIdentity(address)));

  const value = useMemo<SessionState>(
    () => ({ settings, address, isConnected, team, teamLoading, session, email, walletUnlinked, ensureSignedIn, cancelSignIn, signInWithEmail, linkEmail, linkWallet, refresh, signOut, error }),
    [settings, address, isConnected, team, teamLoading, session, email, walletUnlinked, ensureSignedIn, cancelSignIn, signInWithEmail, linkEmail, linkWallet, refresh, signOut, error],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
