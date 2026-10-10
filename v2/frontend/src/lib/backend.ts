// Connection to the backend canister.
//
// The browser keeps an Ed25519 "session key" in localStorage. Every call is
// signed with it; after the wallet signs the sign-in message, the canister
// maps this key's principal to the user until the session expires, so moves
// need no wallet popups.

import { HttpAgent } from '@icp-sdk/core/agent';
import { safeGetCanisterEnv } from '@icp-sdk/core/agent/canister-env';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { createActor, type Backend } from '../bindings/backend';

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

let identity = loadSessionKey();
let backend: Backend | null = null;

function connect(): Backend {
  const env = safeGetCanisterEnv<Env>();
  const canisterId = env?.['PUBLIC_CANISTER_ID:backend'] ?? import.meta.env.VITE_BACKEND_CANISTER_ID;
  if (!canisterId) {
    throw new Error('Backend canister id is unknown: deploy with `icp deploy` or set VITE_BACKEND_CANISTER_ID.');
  }
  const host = import.meta.env.VITE_IC_HOST ?? window.location.origin;
  const agent = HttpAgent.createSync({
    host,
    identity,
    rootKey: env?.IC_ROOT_KEY,
    // Vite dev server against a local network: no cookie, so fetch the key.
    shouldFetchRootKey: !env && host.includes('localhost'),
  });
  return createActor(canisterId, { agent });
}

export function api(): Backend {
  if (!backend) backend = connect();
  return backend;
}

export function sessionPrincipal(): string {
  return identity.getPrincipal().toText();
}

/** Forgets the session key, e.g. after signing out. */
export function resetSessionKey() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
  identity = loadSessionKey();
  backend = null;
}

/** Unwraps a canister `Result`, throwing its error text. */
export function ok<T>(r: { __kind__: 'Ok'; Ok: T } | { __kind__: 'Err'; Err: string }): T {
  if (r.__kind__ === 'Err') throw new Error(r.Err);
  return r.Ok;
}

export function errorText(e: unknown): string {
  if (e instanceof Error) {
    // Agent errors carry long replica details; keep the first line.
    return e.message.split('\n')[0];
  }
  return String(e);
}

/** IC time (nanoseconds) to JS milliseconds. */
export function nsToMs(ns: bigint): number {
  return Number(ns / 1_000_000n);
}
