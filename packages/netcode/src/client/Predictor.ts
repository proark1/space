import { applyInput } from '../sim/capsule';
import type { CapsuleState } from '../sim/capsule';
import type { InputCmd } from '../wire/input';

/**
 * Client-side prediction + reconciliation for the LOCAL player (backlog T13). The local input
 * is applied immediately so movement feels zero-latency; each input is buffered until the host
 * acks it. On every snapshot the client rebases onto the host's authoritative state at the acked
 * seq and REPLAYS the still-unacked inputs — so with deterministic kinematics the corrected state
 * equals the prediction (no rubber-band). A correction larger than the snap threshold is treated
 * as chronic desync: hard-snap and warn exactly once.
 */

export interface PredictorOptions {
  /** Correction distance (metres) above which a reconcile is a force-snap, not a smooth nudge. */
  forceSnapDistance?: number;
  onForceSnap?: (distance: number) => void;
}

export class Predictor {
  private state: CapsuleState;
  private pending: InputCmd[] = [];
  private snappedOnce = false;

  constructor(
    initial: CapsuleState,
    private readonly opts: PredictorOptions = {},
  ) {
    this.state = { ...initial };
  }

  get predicted(): CapsuleState {
    return this.state;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /** Apply a local input immediately and buffer it for later reconciliation. */
  predict(cmd: InputCmd): CapsuleState {
    this.state = applyInput(this.state, cmd);
    this.pending.push(cmd);
    if (this.pending.length > 256) this.pending.splice(0, this.pending.length - 256);
    return this.state;
  }

  /** Rebase onto the host's authoritative state at `ackedSeq`, then replay unacked inputs. */
  reconcile(authoritative: CapsuleState, ackedSeq: number): CapsuleState {
    let keep = 0;
    for (let i = 0; i < this.pending.length; i++) {
      const cmd = this.pending[i]!;
      if (cmd.seq <= ackedSeq) continue;
      this.pending[keep++] = cmd;
    }
    this.pending.length = keep;
    let corrected: CapsuleState = { ...authoritative };
    for (const c of this.pending) corrected = applyInput(corrected, c);

    const dist = Math.hypot(corrected.x - this.state.x, corrected.z - this.state.z);
    const threshold = this.opts.forceSnapDistance ?? 2;
    if (dist > threshold && !this.snappedOnce) {
      this.opts.onForceSnap?.(dist);
      this.snappedOnce = true;
    }
    this.state = corrected; // the authoritative replay is the truth
    return this.state;
  }
}
