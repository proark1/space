// @sl/engine — orchestration: fixed-timestep GameLoop (T21), host physics (T23: PhysicsWorld + KCC
// + ECS sync), the top-level game machine (T32), and the Game composition root.
export { Game } from './Game';
export type { GameOptions } from './Game';
export { GameLoop } from './GameLoop';
export type { GameLoopOptions } from './GameLoop';
export { createGameMachine, GameFlowMachine } from './fsm/gameMachine';
export type { GameFlowEvent, GameFlowListener, GameFlowState } from './fsm/gameMachine';
export { PhysicsWorld, PHYSICS_FIXED_DT } from './physics/PhysicsWorld';
export type { Vec3, PhysicsCharacter, PhysicsBox } from './physics/PhysicsWorld';
export { syncBodyToTransform, syncBodiesToTransforms } from './physics/physicsSync';
export { PlayerController } from './player/PlayerController';
export type { MoveInput, PlayerControllerOptions } from './player/PlayerController';
export { InProcessMultiplayerSlice } from './net/InProcessMultiplayerSlice';
export type {
  InProcessClientIntent,
  InProcessMultiplayerSliceOptions,
  InProcessStepResult,
} from './net/InProcessMultiplayerSlice';
export { GameplayNetDriver, createGameplaySession } from './net/GameplayNetDriver';
export type {
  ClientInputIntent,
  CreateGameplaySessionOptions,
  GameplayNetDriverOptions,
} from './net/GameplayNetDriver';
