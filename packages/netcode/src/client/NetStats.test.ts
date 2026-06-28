import { describe, it, expect } from 'vitest';
import { NetStats } from './NetStats';

describe('NetStats', () => {
  it('smooths RTT and passes through the simple gauges', () => {
    const s = new NetStats();
    s.recordRtt(40);
    s.recordRtt(60);
    s.setSelectedPair('relay');
    s.setBuffered(3);
    s.setTickDrift(12);
    const v = s.view(1000);
    expect(v.rttMs).toBeGreaterThan(40);
    expect(v.rttMs).toBeLessThan(60);
    expect(v.selectedPair).toBe('relay');
    expect(v.bufferedSnapshots).toBe(3);
    expect(v.tickDriftMs).toBe(12);
  });

  it('counts snapshot Hz and averages bytes over the 1s window', () => {
    const s = new NetStats();
    for (let i = 0; i < 20; i++) s.recordSnapshot(i * 50 + 50, 300 + i, i * 3); // 20 over (0,1000]ms
    const v = s.view(1000);
    expect(v.snapshotHz).toBe(20);
    expect(v.snapshotBytesAvg).toBeGreaterThan(300);
  });

  it('derives loss% from gaps in the snapshot tick sequence', () => {
    const s = new NetStats();
    // ticks 0,3,6,12,15 over 250ms — tick 9 is missing → 1 of 6 expected lost ≈ 17%
    [0, 3, 6, 12, 15].forEach((tick, i) => s.recordSnapshot(i * 50, 300, tick));
    const v = s.view(250);
    expect(v.lossPct).toBeGreaterThan(10);
    expect(v.lossPct).toBeLessThan(25);
  });
});
