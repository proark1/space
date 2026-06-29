import type { Signaler, SignalPayload } from './TrysteroSignaler';

type WorkerSignalMsg =
  | { t: 'welcome'; self: string; peers: string[] }
  | { t: 'peer-join'; peerId: string }
  | { t: 'peer-leave'; peerId: string }
  | { t: 'signal'; to?: string; from?: string; data: unknown };

export function toWebSocketRoomUrl(baseUrl: string, code: string): string {
  const url = new URL(baseUrl);
  if (url.protocol === 'http:') url.protocol = 'ws:';
  else if (url.protocol === 'https:') url.protocol = 'wss:';
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}/room/${code.trim().toUpperCase()}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseWorkerSignal(raw: string): WorkerSignalMsg | null {
  try {
    const msg: unknown = JSON.parse(raw);
    return isRecord(msg) && typeof msg.t === 'string' ? (msg as WorkerSignalMsg) : null;
  } catch {
    return null;
  }
}

/**
 * Cloudflare Durable Object WebSocket signaling. This is a drop-in alternative to Trystero's
 * public relay path: the game still sends only SDP/ICE here, never gameplay packets.
 */
export function createWebSocketSignaler(code: string, baseUrl: string): Signaler {
  const peerJoinCallbacks = new Set<(peerId: string) => void>();
  const peerLeaveCallbacks = new Set<(peerId: string) => void>();
  const messageCallbacks = new Set<(peerId: string, msg: SignalPayload) => void>();
  const pending: string[] = [];
  let self = '';

  const ws = new WebSocket(toWebSocketRoomUrl(baseUrl, code));
  ws.addEventListener('open', () => {
    while (pending.length > 0) ws.send(pending.shift()!);
  });
  ws.addEventListener('message', (event: MessageEvent) => {
    if (typeof event.data !== 'string') return;
    const msg = parseWorkerSignal(event.data);
    if (!msg) return;

    if (msg.t === 'welcome') {
      self = msg.self;
      for (const peerId of msg.peers) {
        for (const cb of peerJoinCallbacks) cb(peerId);
      }
    } else if (msg.t === 'peer-join') {
      for (const cb of peerJoinCallbacks) cb(msg.peerId);
    } else if (msg.t === 'peer-leave') {
      for (const cb of peerLeaveCallbacks) cb(msg.peerId);
    } else if (msg.t === 'signal' && msg.from) {
      for (const cb of messageCallbacks) cb(msg.from, msg.data as SignalPayload);
    }
  });

  const sendRaw = (data: string): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
    else pending.push(data);
  };

  return {
    get selfId() {
      return self;
    },
    onPeerJoin: (cb) => {
      peerJoinCallbacks.add(cb);
    },
    onPeerLeave: (cb) => {
      peerLeaveCallbacks.add(cb);
    },
    send: (peerId, msg) => {
      sendRaw(JSON.stringify({ t: 'signal', to: peerId, data: msg }));
    },
    onMessage: (cb) => {
      messageCallbacks.add(cb);
    },
    leave: async () => {
      ws.close();
    },
  };
}
