/**
 * Outgoing-request rate limiter for the ElevenLabs provider (spec 04 §3.2–3.3). Caps concurrency
 * so we never hammer the API with more than `maxConcurrency` (4) parallel calls, and a companion
 * helper honors HTTP 429 Retry-After by backing off the indicated number of seconds.
 */
export class RateLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxConcurrency = 4) {}

  get activeCount(): number {
    return this.active;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

export interface AttemptResult<T> {
  status: number;
  retryAfterSeconds?: number;
  value?: T;
}

/** Run `attempt`, retrying on HTTP 429 after waiting Retry-After seconds (injected sleep). */
export async function withRetryAfter<T>(
  attempt: () => Promise<AttemptResult<T>>,
  opts: { sleep: (ms: number) => Promise<void>; maxRetries?: number },
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  for (let i = 0; ; i++) {
    const r = await attempt();
    if (r.status !== 429) {
      if (r.value === undefined) throw new Error(`request failed with status ${r.status}`);
      return r.value;
    }
    if (i >= maxRetries) throw new Error('rate limited: retries exhausted');
    await opts.sleep((r.retryAfterSeconds ?? 1) * 1000);
  }
}
