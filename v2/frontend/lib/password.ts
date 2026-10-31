// Email + password: the browser stretches the password before it leaves the
// page, so the canister (and the replicas that see the call) only ever get a
// derived key, never the password itself. The canister hashes that key again
// with its own random salt (see crates/backend/src/email.rs).

export const MIN_PASSWORD_LENGTH = 8;
const ROUNDS = 210_000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** PBKDF2-HMAC-SHA256(password, "tactiball:" + email, 210 000 rounds), 32 bytes. */
export async function passwordKey(email: string, password: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`tactiball:${normalizeEmail(email)}`), iterations: ROUNDS },
    base,
    256,
  );
  return new Uint8Array(bits);
}
