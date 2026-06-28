/**
 * Friends-only room codes. 6 chars of Crockford base32 (no I, L, O, U) → ~1.07e9 space.
 * The code is the only secret needed to join a room, so it doubles as the Trystero room
 * password (signaling traffic is encrypted to anyone without the code).
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const APP_ID = 'signal-lost';

export function generateRoomCode(): string {
  const buf = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(buf, (b) => ALPHABET.charAt(b % 32)).join('');
}

export function isValidRoomCode(s: string): boolean {
  return /^[0-9A-HJ-NP-TV-Z]{6}$/.test(s.trim().toUpperCase());
}

/** Namespaced so codes can't collide across builds/versions. */
export function roomId(code: string): string {
  return `signal-lost/v1/${code.trim().toUpperCase()}`;
}
