/**
 * Ephemeral TURN credentials via the TURN REST API (backlog T06). The long-lived secret stays
 * on the worker; the browser only ever gets a short-lived username/credential pair:
 *   username   = `${expiryUnixSeconds}:${roomId}`
 *   credential = base64( HMAC-SHA1(secret, username) )
 * Pure + Web-Crypto-based (works in the Workers runtime and in Node), so it unit-tests headlessly.
 */

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export interface TurnCredentials {
  username: string;
  credential: string;
  urls: string[];
  expiresAt: number;
}

export async function mintTurnCredentials(opts: {
  roomId: string;
  secret: string;
  turnHost: string;
  nowSeconds: number;
  ttlSeconds?: number;
}): Promise<TurnCredentials> {
  const ttl = opts.ttlSeconds ?? 3600;
  const expiresAt = Math.floor(opts.nowSeconds) + ttl;
  const username = `${expiresAt}:${opts.roomId}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(opts.secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(username));
  return {
    username,
    credential: toBase64(new Uint8Array(sig)),
    urls: [
      `turn:${opts.turnHost}:3478?transport=udp`,
      `turn:${opts.turnHost}:3478?transport=tcp`,
      `turns:${opts.turnHost}:5349`,
    ],
    expiresAt,
  };
}
