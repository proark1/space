import { describe, it, expect } from 'vitest';
import { HostLossWatcher } from './HostLossWatcher';

describe('HostLossWatcher', () => {
  it('fires once after 8s of host silence, and not before', () => {
    let lost = 0;
    const w = new HostLossWatcher(() => lost++);
    w.heard(0);
    w.tick(5000);
    expect(lost).toBe(0); // still within the window
    w.tick(9000);
    expect(lost).toBe(1); // crossed 8s
    w.tick(12000);
    expect(lost).toBe(1); // does not re-fire
  });

  it('re-arms after hearing from the host again', () => {
    let lost = 0;
    const w = new HostLossWatcher(() => lost++);
    w.heard(0);
    w.tick(9000);
    expect(lost).toBe(1);
    w.heard(9000); // host came back
    w.tick(15000);
    expect(lost).toBe(1); // within 8s of the new heartbeat
    w.tick(18000);
    expect(lost).toBe(2); // silent again past the timeout
  });

  it('never fires before any heartbeat is recorded', () => {
    let lost = 0;
    const w = new HostLossWatcher(() => lost++);
    w.tick(100000);
    expect(lost).toBe(0);
  });
});
