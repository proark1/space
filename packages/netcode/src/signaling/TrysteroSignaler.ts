import { joinRoom, selfId } from 'trystero';
import { APP_ID, roomId } from './roomCode';

/**
 * Signaling carries ONLY WebRTC SDP + ICE between peers — never game data. Once the game
 * DataChannels open, this relay goes idle (kept open for late joiners / renegotiation).
 *
 * Trystero's default strategy is nostr (public relays), so two friends can connect with no
 * server of our own. The room password is the code itself, so signaling is encrypted to
 * anyone without it. Payloads are JSON strings to stay within Trystero's JsonValue contract.
 */

export type SignalPayload =
  | { t: 'offer' | 'answer'; sdp: string }
  | { t: 'ice'; candidate: RTCIceCandidateInit };

export interface Signaler {
  readonly selfId: string;
  onPeerJoin(cb: (peerId: string) => void): void;
  onPeerLeave(cb: (peerId: string) => void): void;
  send(peerId: string, msg: SignalPayload): void;
  onMessage(cb: (peerId: string, msg: SignalPayload) => void): void;
  leave(): Promise<void>;
}

export function createSignaler(code: string): Signaler {
  const room = joinRoom({ appId: APP_ID, password: code }, roomId(code));
  const [sendSig, getSig] = room.makeAction<string>('sig');

  return {
    selfId,
    onPeerJoin: (cb) => room.onPeerJoin(cb),
    onPeerLeave: (cb) => room.onPeerLeave(cb),
    send: (peerId, msg) => {
      void sendSig(JSON.stringify(msg), peerId);
    },
    onMessage: (cb) =>
      getSig((data, peerId) => {
        try {
          cb(peerId, JSON.parse(data) as SignalPayload);
        } catch {
          /* ignore malformed signaling payloads */
        }
      }),
    leave: () => room.leave(),
  };
}
