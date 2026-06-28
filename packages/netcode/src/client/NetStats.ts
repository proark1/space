/**
 * Rolling network telemetry for the debug HUD (backlog T15). Accumulates samples and derives the
 * metrics over a 1s window; the HUD reads `view()` at ≤4 Hz so React never re-renders per frame.
 */

export interface NetStatsView {
  rttMs: number;
  lossPct: number;
  snapshotBytesAvg: number;
  snapshotHz: number;
  inputHz: number;
  tickDriftMs: number;
  selectedPair: string;
  bufferedSnapshots: number;
}

const WINDOW_MS = 1000;
/** 60Hz sim broadcast every 3rd tick → consecutive snapshots' serverTick differs by 3. */
const SNAPSHOT_TICK_STEP = 3;

export class NetStats {
  private rtt = 0;
  private snaps: Array<{ t: number; bytes: number; tick: number }> = [];
  private inputs: number[] = [];
  private selectedPair = '—';
  private buffered = 0;
  private tickDrift = 0;

  recordRtt(ms: number): void {
    this.rtt = this.rtt === 0 ? ms : this.rtt * 0.8 + ms * 0.2;
  }

  recordSnapshot(now: number, bytes: number, serverTick: number): void {
    this.snaps.push({ t: now, bytes, tick: serverTick });
    this.trim(now);
  }

  recordInput(now: number): void {
    this.inputs.push(now);
    this.trim(now);
  }

  setSelectedPair(pair: string): void {
    this.selectedPair = pair;
  }

  setBuffered(n: number): void {
    this.buffered = n;
  }

  setTickDrift(ms: number): void {
    this.tickDrift = ms;
  }

  view(now: number): NetStatsView {
    this.trim(now);
    const recentSnaps = this.snaps.filter((s) => s.t > now - WINDOW_MS);
    const recentInputs = this.inputs.filter((t) => t > now - WINDOW_MS);
    const bytesAvg = recentSnaps.length
      ? recentSnaps.reduce((sum, s) => sum + s.bytes, 0) / recentSnaps.length
      : 0;
    return {
      rttMs: Math.round(this.rtt),
      lossPct: this.computeLoss(recentSnaps),
      snapshotBytesAvg: Math.round(bytesAvg),
      snapshotHz: recentSnaps.length,
      inputHz: recentInputs.length,
      tickDriftMs: Math.round(this.tickDrift),
      selectedPair: this.selectedPair,
      bufferedSnapshots: this.buffered,
    };
  }

  private trim(now: number): void {
    const cut = now - 2 * WINDOW_MS;
    while (this.snaps.length && this.snaps[0]!.t < cut) this.snaps.shift();
    while (this.inputs.length && this.inputs[0]! < cut) this.inputs.shift();
  }

  private computeLoss(recent: Array<{ tick: number }>): number {
    if (recent.length < 2) return 0;
    const ticks = recent.map((s) => s.tick).sort((a, b) => a - b);
    const span = ticks[ticks.length - 1]! - ticks[0]!;
    const expected = Math.floor(span / SNAPSHOT_TICK_STEP) + 1;
    const received = recent.length;
    return expected <= received ? 0 : Math.round(((expected - received) / expected) * 100);
  }
}
