import {
  createGameWorld,
  spawnPlayer,
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
    this.playerController.applyInput(this.physics, this.playerCharacter, this.input, dt);
    this.physics.step();
    syncBodyToTransform(this.playerEid, this.playerCharacter.body);
    this.opts.onFixedStep?.(dt, tick, this);
  }
}
