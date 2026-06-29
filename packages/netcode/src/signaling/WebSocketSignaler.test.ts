import { describe, expect, it } from 'vitest';
import { toWebSocketRoomUrl } from './WebSocketSignaler';

describe('toWebSocketRoomUrl', () => {
  it('maps an http(s) Worker base URL to /room/CODE websocket URL', () => {
    expect(toWebSocketRoomUrl('https://signal.example.com', 'ab12cd')).toBe(
      'wss://signal.example.com/room/AB12CD',
    );
    expect(toWebSocketRoomUrl('http://127.0.0.1:8787/base/', 'K7M2QX')).toBe(
      'ws://127.0.0.1:8787/base/room/K7M2QX',
    );
  });
});
