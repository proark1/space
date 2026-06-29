import { PROTOCOL_VERSION, MsgType, Channel } from '@sl/shared-types';
import type { ConnectionState } from '@sl/shared-types';
import { ByteWriter, ByteReader } from '../byte';
import { writeHeader, readHeader } from '../wire/header';
import { PingTracker, pongForPing } from '../wire/ping';
import { NetStats } from '../client/NetStats';
import type { NetStatsView } from '../client/NetStats';
import { HostLossWatcher } from '../client/HostLossWatcher';
import { createSignaler } from '../signaling/TrysteroSignaler';
import type { Signaler, SignalPayload } from '../signaling/TrysteroSignaler';
import { createWebSocketSignaler } from '../signaling/WebSocketSignaler';
import { PeerLink } from './PeerLink';
import { ConnectionMachine } from './ConnectionMachine';

/**
 * Ties signaling + PeerLink + ConnectionMachine into one host-authoritative session. The host
 * (room creator, flagged by creation — not a heuristic) is the WebRTC offerer; clients answer.
 * On both channels opening, the host sends a HELLO. PING/PONG every ~1s drives RTT (T15); a client
 * that hears nothing from the host for 8s reports host-loss (T16). `tick(now)`-driven so the
 * client owns the cadence. Browser-only — verified live in two tabs, not headlessly.
 */

export interface SessionEvents {
  onState: (s: ConnectionState) => void;
  onLog?: (msg: string) => void;
  onPeers?: (peerIds: string[]) => void;
  onReliable?: (peerId: string, data: ArrayBuffer) => void;
  onUnreliable?: (peerId: string, data: ArrayBuffer) => void;
  onStats?: (stats: NetStatsView) => void;
  onHostLost?: () => void;
}

export interface Session {
  readonly code: string;
  readonly isHost: boolean;
  readonly peerIds: readonly string[];
  /** Drive periodically (e.g. 4 Hz): schedules pings, checks host-loss, emits stats. */
  tick(): void;
  sendReliable(peerId: string, data: ArrayBufferView<ArrayBuffer>): void;
  sendUnreliable(peerId: string, data: ArrayBufferView<ArrayBuffer>): void;
  broadcastReliable(data: ArrayBufferView<ArrayBuffer>): void;
  broadcastUnreliable(data: ArrayBufferView<ArrayBuffer>): void;
  leave(): void;
}

export function createSession(opts: {
  code: string;
  isHost: boolean;
  iceServers: RTCIceServer[];
  events: SessionEvents;
  /** Optional Worker/DO base URL. When omitted, Trystero's public relay path is used. */
  signalingUrl?: string;
  /** Test/integration hook; overrides signalingUrl and the default Trystero signaler. */
  signaler?: Signaler;
  now?: () => number;
}): Session {
  const { code, isHost, iceServers, events } = opts;
  const now = opts.now ?? ((): number => performance.now());
  const log = (m: string): void => events.onLog?.(m);
  const machine = new ConnectionMachine((s) => events.onState(s));
  const links = new Map<string, PeerLink>();
  const pingers = new Map<string, PingTracker>();
  const stats = new NetStats();
  const hostLoss = new HostLossWatcher(() => {
    log('host lost — no signal for 8s');
    events.onHostLost?.();
    machine.onPcState('failed');
  });
  const signaler =
    opts.signaler ?? (opts.signalingUrl ? createWebSocketSignaler(code, opts.signalingUrl) : createSignaler(code));
  const short = (id: string): string => id.slice(0, 6);
  const announce = (): void => events.onPeers?.([...links.keys()]);

  let lastPingAt = 0;
  let lastPairAt = 0;

  machine.startSignaling();

  function wireBytes(data: ArrayBuffer | ArrayBufferView<ArrayBuffer>): Uint8Array {
    return data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  function recordWireStats(data: ArrayBuffer | ArrayBufferView<ArrayBuffer>, t = now()): void {
    const bytes = wireBytes(data);
    try {
      const header = readHeader(new ByteReader(bytes));
      if (header.msgType === MsgType.Snapshot) stats.recordSnapshot(t, bytes.byteLength, header.serverTick);
      else if (header.msgType === MsgType.Input) stats.recordInput(t);
    } catch {
      /* non-game packet or malformed user data: ignore for telemetry */
    }
  }

  function handleReliable(peerId: string, data: ArrayBuffer): void {
    if (!isHost) hostLoss.heard(now());
    const bytes = new Uint8Array(data);
    let msgType: number;
    try {
      msgType = readHeader(new ByteReader(bytes)).msgType;
    } catch {
      events.onReliable?.(peerId, data);
      return;
    }
    if (msgType === MsgType.Ping) {
      links.get(peerId)?.sendReliable(new Uint8Array(pongForPing(bytes)));
      return;
    }
    if (msgType === MsgType.Pong) {
      const rtt = pingers.get(peerId)?.onPong(bytes, now());
      if (rtt != null) stats.recordRtt(rtt);
      return;
    }
    if (msgType === MsgType.Hello) {
      log(`handshake ok with ${short(peerId)}`);
      return;
    }
    events.onReliable?.(peerId, data);
  }

  function linkFor(peerId: string): PeerLink {
    const existing = links.get(peerId);
    if (existing) return existing;
    const link = new PeerLink(iceServers, {
      onIce: (candidate) => signaler.send(peerId, { t: 'ice', candidate }),
      onState: (s) => {
        machine.onPcState(s);
        if (s === 'failed' || s === 'closed') {
          links.delete(peerId);
          pingers.delete(peerId);
          announce();
        }
      },
      onOpen: () => {
        machine.connected();
        if (!isHost) hostLoss.heard(now());
        const hello = new ByteWriter(16);
        writeHeader(hello, { msgType: MsgType.Hello, serverTick: 0, channelKind: Channel.Reliable });
        hello.u32(PROTOCOL_VERSION);
        link.sendReliable(hello.bytes());
        log(`peer ${short(peerId)} connected`);
      },
      onReliable: (data) => handleReliable(peerId, data),
      onUnreliable: (data) => {
        if (!isHost) hostLoss.heard(now());
        recordWireStats(data);
        events.onUnreliable?.(peerId, data);
      },
    });
    links.set(peerId, link);
    pingers.set(peerId, new PingTracker());
    announce();
    return link;
  }

  async function refreshSelectedPair(pc: RTCPeerConnection): Promise<void> {
    try {
      const report = await pc.getStats();
      let pairId: string | undefined;
      let localId: string | undefined;
      let type = '—';
      report.forEach((s) => {
        const r = s as unknown as Record<string, unknown>;
        if (r.type === 'transport' && typeof r.selectedCandidatePairId === 'string') {
          pairId = r.selectedCandidatePairId;
        }
      });
      report.forEach((s) => {
        const r = s as unknown as Record<string, unknown>;
        if (r.type === 'candidate-pair' && (r.id === pairId || (r.nominated && r.state === 'succeeded'))) {
          if (typeof r.localCandidateId === 'string') localId = r.localCandidateId;
        }
      });
      report.forEach((s) => {
        const r = s as unknown as Record<string, unknown>;
        if (r.id === localId && r.type === 'local-candidate' && typeof r.candidateType === 'string') {
          type = r.candidateType;
        }
      });
      stats.setSelectedPair(type);
    } catch {
      /* getStats best-effort */
    }
  }

  signaler.onPeerJoin((peerId) => {
    log(`peer ${short(peerId)} joined`);
    const link = linkFor(peerId);
    machine.connecting();
    if (isHost) {
      void link
        .createOffer()
        .then((offer) => signaler.send(peerId, { t: 'offer', sdp: offer.sdp ?? '' }));
    }
  });

  signaler.onPeerLeave((peerId) => {
    links.get(peerId)?.close();
    links.delete(peerId);
    pingers.delete(peerId);
    announce();
    log(`peer ${short(peerId)} left`);
  });

  signaler.onMessage((peerId, msg: SignalPayload) => {
    const link = linkFor(peerId);
    if (msg.t === 'offer' && !isHost) {
      void link
        .acceptOfferCreateAnswer({ type: 'offer', sdp: msg.sdp })
        .then((answer) => signaler.send(peerId, { t: 'answer', sdp: answer.sdp ?? '' }));
    } else if (msg.t === 'answer' && isHost) {
      void link.acceptAnswer({ type: 'answer', sdp: msg.sdp });
    } else if (msg.t === 'ice') {
      link.addIce(msg.candidate);
    }
  });

  return {
    code,
    isHost,
    get peerIds() {
      return [...links.keys()];
    },
    tick: () => {
      const t = now();
      if (t - lastPingAt > 1000) {
        lastPingAt = t;
        for (const [peerId, link] of links) {
          const pinger = pingers.get(peerId);
          if (pinger && link.reliable.readyState === 'open') {
            link.sendReliable(new Uint8Array(pinger.ping(t)));
          }
        }
      }
      if (!isHost) hostLoss.tick(t);
      if (t - lastPairAt > 2000) {
        lastPairAt = t;
        const first = links.values().next().value;
        if (first) void refreshSelectedPair(first.pc);
      }
      stats.setBuffered(links.size);
      events.onStats?.(stats.view(t));
    },
    sendReliable: (peerId, data) => {
      links.get(peerId)?.sendReliable(data);
    },
    sendUnreliable: (peerId, data) => {
      recordWireStats(data);
      links.get(peerId)?.sendUnreliable(data);
    },
    broadcastReliable: (data) => {
      for (const link of links.values()) link.sendReliable(data);
    },
    broadcastUnreliable: (data) => {
      recordWireStats(data);
      for (const link of links.values()) link.sendUnreliable(data);
    },
    leave: () => {
      for (const link of links.values()) link.close();
      links.clear();
      pingers.clear();
      hostLoss.reset();
      void signaler.leave();
      machine.reset();
      announce();
    },
  };
}
