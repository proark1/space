import { describe, expect, it } from 'vitest';
import { buildPeerConnectionConfig } from './PeerLink';

describe('buildPeerConnectionConfig', () => {
  it('uses max-bundle and keeps the default ICE transport policy when unspecified', () => {
    const servers: RTCIceServer[] = [{ urls: ['stun:stun.example.com'] }];
    expect(buildPeerConnectionConfig(servers)).toEqual({
      iceServers: servers,
      bundlePolicy: 'max-bundle',
    });
  });

  it('can force relay-only ICE for deployed TURN verification', () => {
    const servers: RTCIceServer[] = [{ urls: ['turn:turn.example.com:3478'], username: 'u', credential: 'c' }];
    expect(buildPeerConnectionConfig(servers, { iceTransportPolicy: 'relay' })).toEqual({
      iceServers: servers,
      bundlePolicy: 'max-bundle',
      iceTransportPolicy: 'relay',
    });
  });
});
