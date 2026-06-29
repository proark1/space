import { create } from 'zustand';

export interface HudSnapshot {
  readonly health: number;
  readonly battery: number;
  readonly resolve: number;
  readonly ammoMag: number;
  readonly ammoReserve: number;
  readonly objective: string;
  readonly status?: string;
  readonly backend?: string;
  readonly drawCalls?: number;
  readonly gpuMs?: number;
}

export interface HudState extends HudSnapshot {
  readonly lastSyncMs: number;
  setSnapshot(snapshot: HudSnapshot, nowMs: number): void;
}

const EMPTY: HudSnapshot = {
  health: 100,
  battery: 100,
  resolve: 100,
  ammoMag: 0,
  ammoReserve: 0,
  objective: 'stand by',
  status: 'idle',
};

export const useHudStore = create<HudState>()((set) => ({
  ...EMPTY,
  lastSyncMs: 0,
  setSnapshot: (snapshot, nowMs) => set({ ...snapshot, lastSyncMs: nowMs }),
}));

let lastHudSyncMs = -Infinity;

/**
 * Push a HUD snapshot at no more than `maxHz` (T33). Returns true when the store updated, false when
 * the call was throttled, so callers can safely invoke it from a 60Hz sim loop.
 */
export function hudSync(
  snapshot: HudSnapshot,
  nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now(),
  maxHz = 15,
): boolean {
  const minInterval = 1000 / maxHz;
  if (nowMs - lastHudSyncMs < minInterval) return false;
  lastHudSyncMs = nowMs;
  useHudStore.getState().setSnapshot(snapshot, nowMs);
  return true;
}

export function resetHudSyncClock(): void {
  lastHudSyncMs = -Infinity;
}
