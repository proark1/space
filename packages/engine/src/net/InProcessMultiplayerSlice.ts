import { Transform } from '@sl/ecs';
import {
  Buttons,
  InputReceiver,
  InputSendBuffer,
  applySnapshotToMappedEcs,
  buildSnapshotFromEcs,
  type InputCmd,
  type WorldSnapshot,
} from '@sl/netcode';
import type { Game } from '../Game';
import type { MoveInput } from '../player/PlayerController';

export interface InProcessClientIntent {
  readonly buttons: number;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly dtMs?: number;
}

export interface InProcessStepResult {
  readonly freshInputs: readonly InputCmd[];
  readonly snapshot: WorldSnapshot;
  readonly updatedEids: readonly number[];
  readonly hostPosition: { x: number; y: number; z: number };
}

export interface InProcessMultiplayerSliceOptions {
  readonly clientMap?: ReadonlyMap<number, number>;
  readonly senderSlot?: number;
}

function buttonsToMoveInput(cmd: InputCmd): MoveInput {
  const moveX = (cmd.buttons & Buttons.Right ? 1 : 0) - (cmd.buttons & Buttons.Left ? 1 : 0);
  const moveZ = (cmd.buttons & Buttons.Fwd ? 1 : 0) - (cmd.buttons & Buttons.Back ? 1 : 0);
  return {
    moveX,
    moveZ,
    yaw: cmd.moveYaw,
    jump: (cmd.buttons & Buttons.Jump) !== 0,
  };
}

/**
 * Headless host/client bridge for M1 smoke tests. It sends client input through the real input
 * packet codec, applies fresh commands to the authoritative Game, snapshots replicated ECS state,
 * then applies that snapshot through the client id-map bridge.
 */
export class InProcessMultiplayerSlice {
  readonly sendBuffer = new InputSendBuffer();
  readonly receiver = new InputReceiver();

  private tick = 0;
  private readonly clientMap: ReadonlyMap<number, number>;
  private readonly senderSlot: number;

  constructor(private readonly host: Game, opts: InProcessMultiplayerSliceOptions = {}) {
    const hostNetId = host.playerEid;
    this.clientMap = opts.clientMap ?? new Map([[hostNetId, host.playerEid]]);
    this.senderSlot = opts.senderSlot ?? 1;
  }

  step(intent: InProcessClientIntent): InProcessStepResult {
    const dtMs = intent.dtMs ?? Math.round(this.host.loop.fixedDt * 1000);
    this.sendBuffer.push({
      clientTick: this.tick,
      buttons: intent.buttons,
      moveYaw: intent.yaw ?? 0,
      movePitch: intent.pitch ?? 0,
      dtMs,
    });

    const freshInputs = this.receiver.apply(this.sendBuffer.packet({ senderSlot: this.senderSlot }));
    for (const cmd of freshInputs) {
      this.host.setInput(buttonsToMoveInput(cmd));
      this.host.stepFixed(cmd.dtMs / 1000, cmd.clientTick);
    }

    const snapshot = buildSnapshotFromEcs(this.host.world, this.tick);
    const updatedEids = applySnapshotToMappedEcs(snapshot, this.clientMap);
    this.tick++;

    return {
      freshInputs,
      snapshot,
      updatedEids,
      hostPosition: {
        x: Transform.x[this.host.playerEid] ?? 0,
        y: Transform.y[this.host.playerEid] ?? 0,
        z: Transform.z[this.host.playerEid] ?? 0,
      },
    };
  }
}
