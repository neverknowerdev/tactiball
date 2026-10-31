// Connection to the backend canister.
//
// The browser keeps an Ed25519 "session key" in localStorage and signs every
// canister call with it. After the wallet signs the sign-in message once, the
// canister maps this key's principal to the player until the session
// expires, so moves need no wallet popups.

import { HttpAgent } from '@icp-sdk/core/agent';
import { safeGetCanisterEnv } from '@icp-sdk/core/agent/canister-env';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { createActor, type Backend } from '@/lib/bindings/backend';

export * from '@/lib/bindings/backend';

const SESSION_KEY = 'tactiball.sessionKey';

type Env = { 'PUBLIC_CANISTER_ID:backend'?: string };

function loadSessionKey(): Ed25519KeyIdentity {
  try {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) return Ed25519KeyIdentity.fromJSON(saved);
  } catch {
    // Corrupt or unavailable storage: fall through to a fresh key.
  }
  const fresh = Ed25519KeyIdentity.generate();
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(fresh.toJSON()));
  } catch {
    // Private mode: the session lasts until the tab closes.
  }
  return fresh;
}

let identity: Ed25519KeyIdentity | null = null;
let backend: Backend | null = null;

function connect(): Backend {
  identity ??= loadSessionKey();
  // Served by the asset canister, the `ic_env` cookie carries the backend id
  // and the network's root key. `next dev` uses the NEXT_PUBLIC_ variables.
  const env = safeGetCanisterEnv<Env>();
  const canisterId = env?.['PUBLIC_CANISTER_ID:backend'] ?? process.env.NEXT_PUBLIC_BACKEND_CANISTER_ID;
  if (!canisterId) {
    throw new Error('Backend canister id is unknown: deploy with `icp deploy` or set NEXT_PUBLIC_BACKEND_CANISTER_ID.');
  }
  const host = process.env.NEXT_PUBLIC_IC_HOST || window.location.origin;
  const agent = HttpAgent.createSync({
    host,
    identity,
    rootKey: env?.IC_ROOT_KEY,
    // `next dev` against a local network has no cookie, so fetch the key.
    shouldFetchRootKey: !env && /localhost|127\.0\.0\.1/.test(host),
  });
  return createActor(canisterId, { agent });
}

/** The backend actor. Browser only. */
export function api(): Backend {
  if (!backend) backend = connect();
  return backend;
}

/** Forgets the session key, e.g. after signing out. */
export function resetSessionKey() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
  identity = null;
  backend = null;
}

/** Unwraps a canister `Result`, throwing its error text. */
export function ok<T>(r: { __kind__: 'Ok'; Ok: T } | { __kind__: 'Err'; Err: string }): T {
  if (r.__kind__ === 'Err') throw new Error(r.Err);
  return r.Ok;
}

/** Wallet (EIP-1193) error codes worth a plain-language message. */
const WALLET_CODES: Record<number, string> = {
  4001: 'Wallet request cancelled.',
  [-32002]: 'Your wallet already has a request open. Open the wallet extension to finish or reject it, then try again.',
  4100: 'The wallet has not authorized this site yet. Open it and connect.',
  4902: 'This network is not added to your wallet yet.',
};

/**
 * A readable one-line message for anything thrown: `Error`s, viem/wagmi
 * errors, and the plain `{ code, message }` objects wallets such as MetaMask
 * throw. Never "[object Object]".
 */
export function errorText(e: unknown): string {
  const seen = new Set<unknown>();
  let code: number | undefined;
  let text: string | undefined;
  // Walk the error and what it wraps; the innermost wallet code wins, the
  // outermost readable message is kept as a fallback.
  for (let cur: unknown = e; cur && typeof cur === 'object' && !seen.has(cur); ) {
    seen.add(cur);
    const o = cur as { code?: unknown; shortMessage?: unknown; message?: unknown; details?: unknown; cause?: unknown; error?: unknown; data?: unknown };
    if (typeof o.code === 'number' && WALLET_CODES[o.code]) code = o.code;
    for (const t of [o.shortMessage, o.message, o.details]) {
      if (!text && typeof t === 'string' && t.trim()) text = t;
    }
    cur = o.cause ?? o.error ?? o.data;
  }
  if (code !== undefined) return WALLET_CODES[code];
  if (typeof e === 'string') text = e;
  if (!text) {
    try {
      text = JSON.stringify(e);
    } catch {
      text = String(e);
    }
  }
  // Agent errors carry long replica details; keep the first line.
  return (text ?? 'Something went wrong').split('\n')[0];
}

/** IC time (nanoseconds) to JS milliseconds. */
export function nsToMs(ns: bigint): number {
  return Number(ns / 1_000_000n);
}

/** ELO is stored ×100 (10000 = 100.00), as in v1. */
export function formatElo(elo: bigint | number): string {
  return (Number(elo) / 100).toFixed(2);
}
