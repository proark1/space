import { describe, expect, it } from 'vitest';
import { hudSync, resetHudSyncClock, useHudStore } from './store';

describe('hudSync', () => {
  it('throttles updates to the requested max Hz', () => {
    resetHudSyncClock();
    expect(hudSync({ health: 90, battery: 80, resolve: 70, ammoMag: 5, ammoReserve: 30, objective: 'move' }, 0, 15)).toBe(true);
    expect(hudSync({ health: 10, battery: 10, resolve: 10, ammoMag: 1, ammoReserve: 2, objective: 'skip' }, 10, 15)).toBe(false);
    expect(useHudStore.getState().objective).toBe('move');
    expect(hudSync({ health: 10, battery: 10, resolve: 10, ammoMag: 1, ammoReserve: 2, objective: 'sync' }, 67, 15)).toBe(true);
    expect(useHudStore.getState().objective).toBe('sync');
  });
});
