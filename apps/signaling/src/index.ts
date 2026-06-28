import { SignalingRoom } from './room';
import { mintTurnCredentials } from './turn';

export { SignalingRoom };

export interface Env {
  SIGNALING_ROOM: DurableObjectNamespace;
  TURN_SECRET: string;
  TURN_HOST: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // GET /turn?room=CODE -> short-lived TURN credentials for that room.
    if (url.pathname === '/turn') {
      const roomId = url.searchParams.get('room') ?? 'lobby';
      const creds = await mintTurnCredentials({
        roomId,
        secret: env.TURN_SECRET,
        turnHost: env.TURN_HOST,
        nowSeconds: Date.now() / 1000,
      });
      return Response.json(creds);
    }

    // /room/CODE -> WebSocket into that room's Durable Object.
    const match = url.pathname.match(/^\/room\/([0-9A-Za-z-]+)$/);
    if (match) {
      const code = match[1];
      if (code) {
        const stub = env.SIGNALING_ROOM.get(env.SIGNALING_ROOM.idFromName(code));
        return stub.fetch(request);
      }
    }

    return new Response('signal-lost signaling', { status: 200 });
  },
} satisfies ExportedHandler<Env>;
