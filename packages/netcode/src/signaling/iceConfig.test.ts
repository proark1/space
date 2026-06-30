import { describe, it, expect } from 'vitest';
import { buildIceServers, fetchTurnIceEnv, toTurnCredentialsUrl } from './iceConfig';

describe('buildIceServers', () => {
  it('returns STUN-only when no TURN is configured', () => {
    const servers = buildIceServers({});
    const blob = JSON.stringify(servers);
    expect(servers.length).toBeGreaterThanOrEqual(1);
    expect(blob).toContain('stun:');
    expect(blob.toLowerCase()).not.toContain('turn');
  });

  it('adds a TURN entry including turns:5349 when configured', () => {
    const servers = buildIceServers({
      turnHost: 'turn.example.com',
      turnUsername: 'user',
      turnCredential: 'secret',
    });
    const blob = JSON.stringify(servers);
    expect(blob).toContain('turns:turn.example.com:5349');
    expect(blob).toContain('"username":"user"');
    expect(blob).toContain('"credential":"secret"');
  });

  it('uses full TURN urls verbatim when provided (provider non-standard ports)', () => {
    const servers = buildIceServers({
      turnUrls: ['turn:global.relay.metered.ca:80', 'turns:global.relay.metered.ca:443?transport=tcp'],
      turnUsername: 'u',
      turnCredential: 'c',
    });
    const blob = JSON.stringify(servers);
    expect(blob).toContain('turn:global.relay.metered.ca:80');
    expect(blob).toContain('turns:global.relay.metered.ca:443?transport=tcp');
    expect(blob).toContain('"username":"u"');
    expect(blob).not.toContain('3478'); // did not fall back to standard-port construction
  });

  it('throws when TURN is required but missing', () => {
    expect(() => buildIceServers({}, { requireTurn: true })).toThrow();
  });

  it('builds the Worker TURN credential URL from the signaling base URL', () => {
    expect(toTurnCredentialsUrl('https://signal.example.com/base/', 'k7m2qx')).toBe(
      'https://signal.example.com/base/turn?room=K7M2QX',
    );
  });

  it('maps Worker TURN credentials to IceEnv', async () => {
    const seen: string[] = [];
    const env = await fetchTurnIceEnv('https://signal.example.com', 'K7M2QX', async (url) => {
      seen.push(String(url));
      return new Response(
        JSON.stringify({
          username: '4600:K7M2QX',
          credential: 'signed',
          urls: ['turn:turn.example.com:3478?transport=udp', 'turns:turn.example.com:5349'],
          expiresAt: 4600,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    expect(seen).toEqual(['https://signal.example.com/turn?room=K7M2QX']);
    expect(env).toEqual({
      turnUrls: ['turn:turn.example.com:3478?transport=udp', 'turns:turn.example.com:5349'],
      turnUsername: '4600:K7M2QX',
      turnCredential: 'signed',
    });
  });

  it('rejects malformed Worker TURN credentials', async () => {
    await expect(
      fetchTurnIceEnv('https://signal.example.com', 'K7M2QX', async () => new Response(JSON.stringify({ urls: ['turn:x'] }))),
    ).rejects.toThrow(/malformed/);
  });
});
