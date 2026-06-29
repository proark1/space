// @sl/engine — orchestration: fixed-timestep GameLoop (T21), host physics (T23: PhysicsWorld + KCC
// + ECS sync), the top-level XState gameMachine (T32), and the Game composition root. The FSM +
// Game land in later M1 Phase A tasks.
export { GameLoop } from './GameLoop';
export type { GameLoopOptions } from './GameLoop';
export { PhysicsWorld, PHYSICS_FIXED_DT } from './physics/PhysicsWorld';
export type { Vec3, PhysicsCharacter, PhysicsBox } from './physics/PhysicsWorld';
export { syncBodyToTransform, syncBodiesToTransforms } from './physics/physicsSync';
