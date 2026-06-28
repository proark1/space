/**
 * ICE server configuration. STUN is always present (enough for same-machine / easy-NAT
 * play). TURN is added when configured and is MANDATORY before any cross-network playtest
 * (symmetric NAT can only traverse via relay) — see backlog T17, the M0 green-light gate.
 *
 * Pure + env-injected so it unit-tests cleanly; the client passes values from import.meta.env.
 */

export interface IceEnv {
  /**
   * Full TURN URLs (preferred — most providers use non-standard ports, e.g. metered.ca on
   * 80/443). Takes precedence over turnHost. Example:
   *   ['turn:global.relay.metered.ca:80', 'turns:global.relay.metered.ca:443?transport=tcp']
   */
  turnUrls?: string[];
  /** Or just a host → standard 3478/5349 ports are assembled. Ignored if turnUrls is set. */
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
  if (env.turnUrls && env.turnUrls.length > 0) {
    servers.push({ urls: env.turnUrls, username: env.turnUsername, credential: env.turnCredential });
  } else if (env.turnHost) {
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
    throw new Error('TURN is required but no turnUrls/turnHost is configured (set VITE_TURN_URLS)');
  }
  return servers;
}
