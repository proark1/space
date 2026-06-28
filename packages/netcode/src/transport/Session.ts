import { PROTOCOL_VERSION, MsgType } from '@sl/shared-types';
import type { ConnectionState } from '@sl/shared-types';
import { ByteWriter } from '../byte';
import { createSignaler } from '../signaling/TrysteroSignaler';
import type { SignalPayload } from '../signaling/TrysteroSignaler';
import { PeerLink } from './PeerLink';
import { ConnectionMachine } from './ConnectionMachine';

/**
 * Ties signaling + PeerLink + ConnectionMachine into one host-authoritative session. The
 * host (room creator, flagged by creation — not a heuristic) is the WebRTC offerer; clients
 * answer. On both channels opening, the host's first reliable message is a HELLO carrying the
 * protocol version. The full wire taxonomy (SNAPSHOT/INPUT/EVENT) lands with T09.
 *
 * Browser-only (uses RTCPeerConnection) — verified live in two tabs, not headlessly.
 */

export interface SessionEvents {
  onState: (s: ConnectionState) => void;
  onLog?: (msg: string) => void;
  onPeers?: (peerIds: string[]) => void;
  onReliable?: (peerId: string, data: ArrayBuffer) => void;
}

export interface Session {
  readonly code: string;
  readonly isHost: boolean;
  leave(): void;
}

export function createSession(opts: {
  code: string;
  isHost: boolean;
  iceServers: RTCIceServer[];
  events: SessionEvents;
}): Session {
  const { code, isHost, iceServers, events } = opts;
  const log = (m: string): void => events.onLog?.(m);
  const machine = new ConnectionMachine((s) => events.onState(s));
  const links = new Map<string, PeerLink>();
  const signaler = createSignaler(code);
  const short = (id: string): string => id.slice(0, 6);
  const announce = (): void => events.onPeers?.([...links.keys()]);

  machine.startSignaling();

  function linkFor(peerId: string): PeerLink {
    const existing = links.get(peerId);
    if (existing) return existing;
    const link = new PeerLink(iceServers, {
      onIce: (candidate) => signaler.send(peerId, { t: 'ice', candidate }),
      onState: (s) => {
        machine.onPcState(s);
        if (s === 'failed' || s === 'closed') {
          links.delete(peerId);
          announce();
        }
      },
      onOpen: () => {
        machine.connected();
        const hello = new ByteWriter(8);
        hello.u8(MsgType.Hello).u32(PROTOCOL_VERSION);
        link.sendReliable(hello.bytes());
        log(`peer ${short(peerId)} connected`);
      },
      onReliable: (data) => events.onReliable?.(peerId, data),
    });
    links.set(peerId, link);
    announce();
    return link;
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
    leave: () => {
      for (const link of links.values()) link.close();
      links.clear();
      void signaler.leave();
      machine.reset();
      announce();
    },
  };
}
