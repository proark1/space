import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { mintTurnCredentials } from './turn';

describe('mintTurnCredentials', () => {
  it('produces TURN REST API ephemeral creds matching an independent HMAC-SHA1', async () => {
    const creds = await mintTurnCredentials({
      roomId: 'K7M2QX',
      secret: 'topsecret',
      turnHost: 'turn.example.com',
      nowSeconds: 1000,
      ttlSeconds: 3600,
    });
    expect(creds.username).toBe('4600:K7M2QX'); // expiry = now + ttl
    expect(creds.expiresAt).toBe(4600);
    // Web Crypto HMAC-SHA1 must equal Node's independent computation.
    const expected = createHmac('sha1', 'topsecret').update('4600:K7M2QX').digest('base64');
    expect(creds.credential).toBe(expected);
    expect(creds.urls).toContain('turns:turn.example.com:5349');
    expect(creds.urls.some((u) => u.startsWith('turn:turn.example.com:3478'))).toBe(true);
  });

  it('is deterministic for identical inputs', async () => {
    const a = await mintTurnCredentials({ roomId: 'r', secret: 's', turnHost: 'h', nowSeconds: 0 });
    const b = await mintTurnCredentials({ roomId: 'r', secret: 's', turnHost: 'h', nowSeconds: 0 });
    expect(a.credential).toBe(b.credential);
    expect(a.username).toBe('3600:r');
  });
});
