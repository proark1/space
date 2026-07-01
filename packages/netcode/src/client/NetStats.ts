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
    const cutoff = now - WINDOW_MS;
    let snapshotCount = 0;
    let inputCount = 0;
    let bytesSum = 0;
    let minTick = Infinity;
    let maxTick = -Infinity;
    for (const snap of this.snaps) {
      if (snap.t <= cutoff) continue;
      snapshotCount += 1;
      bytesSum += snap.bytes;
      if (snap.tick < minTick) minTick = snap.tick;
      if (snap.tick > maxTick) maxTick = snap.tick;
    }
    for (const t of this.inputs) {
      if (t > cutoff) inputCount += 1;
    }
    const bytesAvg = snapshotCount ? bytesSum / snapshotCount : 0;
    return {
      rttMs: Math.round(this.rtt),
      lossPct: this.computeLoss(snapshotCount, minTick, maxTick),
      snapshotBytesAvg: Math.round(bytesAvg),
      snapshotHz: snapshotCount,
      inputHz: inputCount,
      tickDriftMs: Math.round(this.tickDrift),
      selectedPair: this.selectedPair,
      bufferedSnapshots: this.buffered,
    };
  }

  private trim(now: number): void {
    const cut = now - 2 * WINDOW_MS;
    let snapTrim = 0;
    while (snapTrim < this.snaps.length && this.snaps[snapTrim]!.t < cut) snapTrim++;
    if (snapTrim > 0) this.snaps.splice(0, snapTrim);
    let inputTrim = 0;
    while (inputTrim < this.inputs.length && this.inputs[inputTrim]! < cut) inputTrim++;
    if (inputTrim > 0) this.inputs.splice(0, inputTrim);
  }

  private computeLoss(received: number, minTick: number, maxTick: number): number {
    if (received < 2 || !Number.isFinite(minTick) || !Number.isFinite(maxTick)) return 0;
    const span = maxTick - minTick;
    const expected = Math.floor(span / SNAPSHOT_TICK_STEP) + 1;
    return expected <= received ? 0 : Math.round(((expected - received) / expected) * 100);
  }
}
