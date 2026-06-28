/**
 * ICE server configuration. STUN is always present (enough for same-machine / easy-NAT
 * play). TURN is added when configured and is MANDATORY before any cross-network playtest
 * (symmetric NAT can only traverse via relay) — see backlog T17, the M0 green-light gate.
 *
 * Pure + env-injected so it unit-tests cleanly; the client passes values from import.meta.env.
 */

export interface IceEnv {
  /** TURN host, e.g. "turn.example.com". When absent, STUN-only is returned. */
  turnHost?: string;
  turnUsername?: string;
  turnCredential?: string;
}

const STUN: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

export function buildIceServers(
  env: IceEnv = {},
  opts: { requireTurn?: boolean } = {},
): RTCIceServer[] {
  const servers: RTCIceServer[] = [...STUN];
  if (env.turnHost) {
    servers.push({
      urls: [
        `turn:${env.turnHost}:3478?transport=udp`,
        `turn:${env.turnHost}:3478?transport=tcp`,
        `turns:${env.turnHost}:5349`,
      ],
      username: env.turnUsername,
      credential: env.turnCredential,
    });
  } else if (opts.requireTurn) {
    throw new Error('TURN is required but no turnHost is configured (set VITE_TURN_HOST)');
  }
  return servers;
}
