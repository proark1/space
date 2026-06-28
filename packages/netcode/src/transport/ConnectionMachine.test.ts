import { describe, it, expect } from 'vitest';
import type { ConnectionState } from '@sl/shared-types';
import { ConnectionMachine } from './ConnectionMachine';

describe('ConnectionMachine', () => {
  it('walks the happy path and emits each change once', () => {
    const seen: ConnectionState[] = [];
    const m = new ConnectionMachine((s) => seen.push(s));
    expect(m.state).toBe('idle');
    m.startSignaling();
    m.connecting();
    m.connected();
    expect(m.state).toBe('connected');
    expect(seen).toEqual(['signaling', 'connecting', 'connected']);
  });

  it('drops to reconnecting only from connected, and to failed on a dead pc', () => {
    const m = new ConnectionMachine();
    m.startSignaling();
    m.connecting();
    m.connected();
    m.onPcState('disconnected');
    expect(m.state).toBe('reconnecting');
    m.onPcState('failed');
    expect(m.state).toBe('failed');
  });

  it('ignores out-of-order transitions and duplicate emits', () => {
    const seen: ConnectionState[] = [];
    const m = new ConnectionMachine((s) => seen.push(s));
    m.connecting(); // ignored from idle
    expect(m.state).toBe('idle');
    m.startSignaling();
    m.startSignaling(); // duplicate, no emit
    expect(seen).toEqual(['signaling']);
  });
});
