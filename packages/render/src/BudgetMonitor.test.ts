import { describe, expect, it } from 'vitest';
import { BudgetMonitor } from './BudgetMonitor';

describe('BudgetMonitor', () => {
  it('tracks draw-call and frame-time budget status over a rolling window', () => {
    const monitor = new BudgetMonitor({ maxDrawCalls: 150, maxMedianFrameMs: 16, maxP95FrameMs: 32, sampleWindow: 5 });
    for (let i = 0; i < 5; i++) {
      monitor.tick({ drawCalls: 12, triangles: 1000, frameMs: 10 + i });
    }
    expect(monitor.view()).toMatchObject({
      samples: 5,
      drawCalls: 12,
      triangles: 1000,
      overDrawCalls: false,
      overMedianFrameMs: false,
      overP95FrameMs: false,
      ok: true,
    });
  });

  it('flags draw call and sustained frame-time budget breaches', () => {
    const monitor = new BudgetMonitor({ maxDrawCalls: 2, maxMedianFrameMs: 8, maxP95FrameMs: 12, sampleWindow: 3 });
    monitor.tick({ drawCalls: 3, frameMs: 10 });
    monitor.tick({ drawCalls: 3, frameMs: 14 });
    monitor.tick({ drawCalls: 3, frameMs: 16 });
    expect(monitor.view()).toMatchObject({
      overDrawCalls: true,
      overMedianFrameMs: true,
      overP95FrameMs: true,
      ok: false,
    });
  });
});
