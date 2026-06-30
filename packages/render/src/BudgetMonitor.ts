export interface RenderBudget {
  readonly maxDrawCalls: number;
  readonly maxMedianFrameMs: number;
  readonly maxP95FrameMs?: number;
  readonly sampleWindow?: number;
}

export interface RenderBudgetSample {
  readonly drawCalls: number;
  readonly triangles?: number;
  readonly frameMs: number;
}

export interface RenderBudgetView {
  readonly samples: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly lastFrameMs: number;
  readonly medianFrameMs: number;
  readonly p95FrameMs: number;
  readonly maxDrawCalls: number;
  readonly maxMedianFrameMs: number;
  readonly maxP95FrameMs: number;
  readonly overDrawCalls: boolean;
  readonly overMedianFrameMs: boolean;
  readonly overP95FrameMs: boolean;
  readonly ok: boolean;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

export class BudgetMonitor {
  private readonly samples: RenderBudgetSample[] = [];
  private readonly maxP95FrameMs: number;
  private readonly sampleWindow: number;

  constructor(private readonly budget: RenderBudget) {
    this.maxP95FrameMs = budget.maxP95FrameMs ?? budget.maxMedianFrameMs * 2;
    this.sampleWindow = budget.sampleWindow ?? 300;
  }

  tick(sample: RenderBudgetSample): RenderBudgetView {
    this.samples.push(sample);
    while (this.samples.length > this.sampleWindow) this.samples.shift();
    return this.view();
  }

  view(): RenderBudgetView {
    const latest = this.samples[this.samples.length - 1];
    const frameTimes = this.samples.map((sample) => sample.frameMs);
    const medianFrameMs = percentile(frameTimes, 50);
    const p95FrameMs = percentile(frameTimes, 95);
    const drawCalls = latest?.drawCalls ?? 0;
    const triangles = latest?.triangles ?? 0;
    const overDrawCalls = drawCalls > this.budget.maxDrawCalls;
    const overMedianFrameMs = medianFrameMs > this.budget.maxMedianFrameMs;
    const overP95FrameMs = p95FrameMs > this.maxP95FrameMs;
    return {
      samples: this.samples.length,
      drawCalls,
      triangles,
      lastFrameMs: latest?.frameMs ?? 0,
      medianFrameMs,
      p95FrameMs,
      maxDrawCalls: this.budget.maxDrawCalls,
      maxMedianFrameMs: this.budget.maxMedianFrameMs,
      maxP95FrameMs: this.maxP95FrameMs,
      overDrawCalls,
      overMedianFrameMs,
      overP95FrameMs,
      ok: !overDrawCalls && !overMedianFrameMs && !overP95FrameMs,
    };
  }
}
