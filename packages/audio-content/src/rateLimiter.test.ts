import { describe, it, expect } from 'vitest';
import { RateLimiter, withRetryAfter } from './rateLimiter';

describe('RateLimiter', () => {
  it('never runs more than the concurrency cap (4) at once', async () => {
    const limiter = new RateLimiter(4);
    let active = 0;
    let maxActive = 0;
    const releasers: Array<() => void> = [];
    const tasks = Array.from({ length: 10 }, () =>
      limiter.run(
        () =>
          new Promise<void>((resolve) => {
            active++;
            maxActive = Math.max(maxActive, active);
            releasers.push(() => {
              active--;
              resolve();
            });
          }),
      ),
    );
    for (let i = 0; i < 5; i++) await Promise.resolve(); // let the first batch start
    expect(maxActive).toBe(4);
    while (releasers.length) {
      releasers.shift()!();
      for (let i = 0; i < 3; i++) await Promise.resolve();
    }
    await Promise.all(tasks);
    expect(maxActive).toBe(4);
    expect(limiter.activeCount).toBe(0);
  });
});

describe('withRetryAfter', () => {
  it('backs off Retry-After seconds on a 429, then succeeds', async () => {
    const slept: number[] = [];
    let calls = 0;
    const value = await withRetryAfter<string>(
      async () => {
        calls++;
        if (calls === 1) return { status: 429, retryAfterSeconds: 2 };
        return { status: 200, value: 'ok' };
      },
      { sleep: async (ms) => { slept.push(ms); } },
    );
    expect(value).toBe('ok');
    expect(calls).toBe(2);
    expect(slept).toEqual([2000]);
  });

  it('throws once retries are exhausted', async () => {
    await expect(
      withRetryAfter(async () => ({ status: 429, retryAfterSeconds: 1 }), {
        sleep: async () => {},
        maxRetries: 2,
      }),
    ).rejects.toThrow(/retries exhausted/);
  });
});
