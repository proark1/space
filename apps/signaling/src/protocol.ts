/**
 * Signaling messages relayed by the room (backlog T06). This carries ONLY WebRTC SDP/ICE between
 * peers plus presence — never game data. Mirrors what the client's TrysteroSignaler exchanges, so
 * this Cloudflare path is a drop-in alternative to the public nostr relays.
 */
export type SignalMsg =
  | { t: 'welcome'; self: string; peers: string[] }
  | { t: 'peer-join'; peerId: string }
  | { t: 'peer-leave'; peerId: string }
  | { t: 'signal'; to?: string; from?: string; data: unknown };
