import type { SignalMsg } from './protocol';

const MAX_PEERS = 4;

/**
 * One Durable Object instance per roomId (spec 02 §2.4). Holds at most 4 WebSocket peers, relays
 * signaling JSON between them, and announces join/leave. When the last peer leaves the DO simply
 * has no sessions and idles out — the platform garbage-collects it, so empty rooms cost nothing.
 */
export class SignalingRoom {
  private readonly sessions = new Map<string, WebSocket>();

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a websocket upgrade', { status: 426 });
    }
    if (this.sessions.size >= MAX_PEERS) {
      return new Response('room full', { status: 403 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.accept(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private accept(ws: WebSocket): void {
    ws.accept();
    const id = crypto.randomUUID();
    const others = [...this.sessions.keys()];
    this.sessions.set(id, ws);

    this.send(ws, { t: 'welcome', self: id, peers: others });
    this.broadcast({ t: 'peer-join', peerId: id }, id);

    ws.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      let msg: SignalMsg;
      try {
        msg = JSON.parse(event.data) as SignalMsg;
      } catch {
        return;
      }
      // Relay a signal to its addressed peer only; stamp the sender.
      if (msg.t === 'signal' && msg.to) {
        const target = this.sessions.get(msg.to);
        if (target) this.send(target, { ...msg, from: id });
      }
    });

    const close = (): void => {
      if (!this.sessions.delete(id)) return;
      this.broadcast({ t: 'peer-leave', peerId: id }, id);
    };
    ws.addEventListener('close', close);
    ws.addEventListener('error', close);
  }

  private send(ws: WebSocket, msg: SignalMsg): void {
    ws.send(JSON.stringify(msg));
  }

  private broadcast(msg: SignalMsg, exceptId: string): void {
    const data = JSON.stringify(msg);
    for (const [peerId, ws] of this.sessions) {
      if (peerId !== exceptId) ws.send(data);
    }
  }
}
