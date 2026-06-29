import {
  createGameWorld,
  NetworkId,
  spawnPlayer,
  spawnRemotePlayer,
  Transform,
  type GameWorld,
  type GameWorldRole,
} from '@sl/ecs';
import { GameLoop, type GameLoopOptions } from './GameLoop';
import { PhysicsWorld, type PhysicsCharacter, type Vec3 } from './physics/PhysicsWorld';
import { syncBodyToTransform } from './physics/physicsSync';
import { PlayerController, type MoveInput } from './player/PlayerController';
import { createGameMachine, type GameFlowEvent, type GameFlowState } from './fsm/gameMachine';

export interface GameOptions {
  readonly role?: GameWorldRole;
  readonly initialPlayerPosition?: Vec3;
  readonly fixedHz?: number;
  readonly now?: GameLoopOptions['now'];
  readonly requestFrame?: GameLoopOptions['requestFrame'];
  readonly cancelFrame?: GameLoopOptions['cancelFrame'];
  readonly configurePhysics?: (physics: PhysicsWorld) => void;
  readonly onFixedStep?: (dt: number, tick: number, game: Game) => void;
  readonly onRender?: (alpha: number, game: Game) => void;
  readonly onStateChange?: (next: GameFlowState, prev: GameFlowState, event: GameFlowEvent) => void;
}

const ZERO_INPUT: MoveInput = { moveX: 0, moveZ: 0, yaw: 0 };

export interface ControlledPlayer {
  readonly eid: number;
  readonly character: PhysicsCharacter;
  readonly controller: PlayerController;
}

export interface ControlledPlayerPose extends Vec3 {
  readonly yaw?: number;
}

export interface ControlledPlayerReplayStep {
  readonly input: MoveInput;
  readonly dt: number;
}

function writeYawQuat(eid: number, yaw: number): void {
  const half = yaw / 2;
  Transform.qx[eid] = 0;
  Transform.qy[eid] = Math.sin(half);
  Transform.qz[eid] = 0;
  Transform.qw[eid] = Math.cos(half);
}

/**
 * The M1 composition root: one ECS world, one host-style Rapier world, one local player capsule,
 * one fixed-step loop, and the top-level flow machine. It is intentionally renderer-agnostic: the
 * app or lookdev harness owns cameras/rendering and observes ECS Transform after each fixed step.
 */
export class Game {
  readonly world: GameWorld;
  readonly physics: PhysicsWorld;
  readonly playerEid: number;
  readonly playerCharacter: PhysicsCharacter;
  readonly playerController: PlayerController;
  readonly machine = createGameMachine();
  readonly loop: GameLoop;

  private input: MoveInput = ZERO_INPUT;
  private disposed = false;
  private externalTick = 0;
  private readonly controlledPlayers = new Map<number, ControlledPlayer>();

  private constructor(
    physics: PhysicsWorld,
    playerCharacter: PhysicsCharacter,
    playerEid: number,
    world: GameWorld,
    private readonly opts: GameOptions,
  ) {
    this.physics = physics;
    this.playerCharacter = playerCharacter;
    this.playerEid = playerEid;
    this.world = world;
    this.playerController = new PlayerController();
    this.controlledPlayers.set(playerEid, {
      eid: playerEid,
      character: playerCharacter,
      controller: this.playerController,
    });
    this.loop = new GameLoop({
      fixedHz: opts.fixedHz ?? 60,
      fixedUpdate: (dt, tick) => this.fixedStep(dt, tick),
      render: (alpha) => opts.onRender?.(alpha, this),
      now: opts.now,
      requestFrame: opts.requestFrame,
      cancelFrame: opts.cancelFrame,
    });

    this.machine.subscribe((next, prev, event) => {
      opts.onStateChange?.(next, prev, event);
      if (next === 'inShip' && prev !== 'inShip') this.loop.start();
      else if (prev === 'inShip' && next !== 'inShip') this.loop.stop();
    });
  }

  static async create(opts: GameOptions = {}): Promise<Game> {
    const world = createGameWorld(opts.role ?? 'local');
    const physics = await PhysicsWorld.create();
    physics.addGround();
    opts.configurePhysics?.(physics);

    const playerEid = spawnPlayer(world);
    const initial = opts.initialPlayerPosition ?? { x: 0, y: 1, z: 0 };
    const playerCharacter = physics.addCharacter(initial);
    Transform.x[playerEid] = initial.x;
    Transform.y[playerEid] = initial.y;
    Transform.z[playerEid] = initial.z;
    syncBodyToTransform(playerEid, playerCharacter.body);

    return new Game(physics, playerCharacter, playerEid, world, opts);
  }

  get state(): GameFlowState {
    return this.machine.state;
  }

  get isRunning(): boolean {
    return this.loop.isRunning;
  }

  send(event: GameFlowEvent): GameFlowState {
    return this.machine.send(event);
  }

  setInput(input: MoveInput): void {
    this.input = input;
  }

  addNetworkPlayer(netId: number, position: Vec3, ownerSlot = 0): ControlledPlayer {
    const existing = [...this.controlledPlayers.values()].find((player) => NetworkId.id[player.eid] === netId);
    if (existing) return existing;

    const eid = spawnRemotePlayer(this.world);
    const character = this.physics.addCharacter(position);
    const controller = new PlayerController();
    NetworkId.id[eid] = netId;
    NetworkId.ownerPeer[eid] = ownerSlot;
    Transform.x[eid] = position.x;
    Transform.y[eid] = position.y;
    Transform.z[eid] = position.z;
    syncBodyToTransform(eid, character.body);

    const player = { eid, character, controller };
    this.controlledPlayers.set(eid, player);
    return player;
  }

  setControlledPlayerPose(eid: number, pose: ControlledPlayerPose): void {
    const player = this.controlledPlayers.get(eid);
    if (!player) throw new Error(`controlled player ${eid} is not registered`);
    const translation = { x: pose.x, y: pose.y, z: pose.z };
    player.character.body.setTranslation(translation, true);
    player.character.body.setNextKinematicTranslation(translation);
    player.controller.reset();
    syncBodyToTransform(eid, player.character.body);
    if (pose.yaw !== undefined) writeYawQuat(eid, pose.yaw);
  }

  controlledPlayerPosition(eid: number): Vec3 {
    const player = this.controlledPlayers.get(eid);
    if (!player) throw new Error(`controlled player ${eid} is not registered`);
    const t = player.character.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  reconcileControlledPlayer(
    eid: number,
    authoritative: ControlledPlayerPose,
    replay: readonly ControlledPlayerReplayStep[] = [],
  ): void {
    this.setControlledPlayerPose(eid, authoritative);
    const player = this.controlledPlayers.get(eid)!;
    for (const step of replay) {
      player.controller.applyInput(this.physics, player.character, step.input, step.dt);
      this.physics.step();
      this.syncControlledTransforms();
      writeYawQuat(eid, step.input.yaw);
    }
  }

  stepControlledPlayer(eid: number, input: MoveInput, dt: number, tick?: number): void {
    const player = this.controlledPlayers.get(eid);
    if (!player) throw new Error(`controlled player ${eid} is not registered`);
    player.controller.applyInput(this.physics, player.character, input, dt);
    this.physics.step();
    this.syncControlledTransforms();
    writeYawQuat(eid, input.yaw);
    this.opts.onFixedStep?.(dt, tick ?? this.loop.currentTick, this);
  }

  /** Deterministic test/in-process driver; browser runtime normally uses `loop.start()`. */
  advance(frameDt: number): number {
    return this.loop.advance(frameDt);
  }

  /** Single fixed tick for externally-owned loops such as lookdev render harnesses. */
  stepFixed(dt: number, tick?: number): void {
    const fixedTick = tick ?? this.externalTick++;
    this.fixedStep(dt, fixedTick);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    this.physics.dispose();
  }

  private fixedStep(dt: number, tick: number): void {
    this.stepControlledPlayer(this.playerEid, this.input, dt, tick);
  }

  private syncControlledTransforms(): void {
    for (const controlled of this.controlledPlayers.values()) {
      syncBodyToTransform(controlled.eid, controlled.character.body);
    }
  }
}
