import { describe, expect, it } from 'vitest';
import worker from './index';
import type { Env } from './index';

const env = {
  TURN_SECRET: 'topsecret',
  TURN_HOST: 'turn.example.com',
  SIGNALING_ROOM: {} as DurableObjectNamespace,
} satisfies Env;

describe('signaling Worker fetch', () => {
  it('allows browser CORS preflight for the TURN credential endpoint', async () => {
    const res = await worker.fetch(new Request('https://signal.example.com/turn', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });

  it('returns TURN credentials with CORS headers', async () => {
    const res = await worker.fetch(new Request('https://signal.example.com/turn?room=K7M2QX'), env);
    const body = await res.json() as { username: string; urls: string[] };
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(body.username.endsWith(':K7M2QX')).toBe(true);
    expect(body.urls).toContain('turns:turn.example.com:5349');
  });
});
