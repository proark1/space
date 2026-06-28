import { describe, it, expect } from 'vitest';
import { buildIceServers } from './iceConfig';

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

  it('throws when TURN is required but missing', () => {
    expect(() => buildIceServers({}, { requireTurn: true })).toThrow();
  });
});
