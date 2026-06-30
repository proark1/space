import {
  BoxGeometry,
  CapsuleGeometry,
  Euler,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Scene,
  Vector3,
} from 'three';
import { Game } from '@sl/engine';
import { Health, PlayerState, Transform, queryRemotePlayers, type GameWorld } from '@sl/ecs';
import { createFlashlight } from '@sl/render';
import type { RenderProfile } from '@sl/render';
import { hudSync } from '@sl/ui';
import type { HarnessScene } from './scene';
import {
  SHIP_CELL_SIZE,
  buildCorridor,
  type CorridorLevel,
  type ShipCell,
  type ShipDoor,
  type ShipPickup,
  type ShipStation,
} from './corridor';
import { createFirstPersonControls, type FirstPersonControls } from './input';
import { loadPlayerUnitFactory, type PlayerUnitFactory, type PlayerUnitInstance } from './playerUnit';

/** Eye height above the capsule centre. Capsule rest centre ≈1.0 (radius .4 + halfHeight .6) ⇒ eye ≈1.62. */
const EYE_OFFSET = 0.62;
const THIRD_PERSON_DISTANCE = 3.2;
const THIRD_PERSON_HEIGHT = 0.72;
const THIRD_PERSON_TARGET_HEIGHT = 0.9;
const PLAYER_RADIUS = 0.48;
const HOLDOUT_SECONDS = 55;

export interface WalkSceneOptions {
  readonly thirdPerson?: boolean;
}

type RunStage = 'restorePower' | 'findFuse' | 'installFuse' | 'holdout' | 'extract' | 'won' | 'dead';
type MonsterMode = 'patrol' | 'investigate' | 'chase' | 'attack' | 'stunned';

interface RemotePlayerVisual {
  readonly root: Object3D;
  readonly unit: PlayerUnitInstance | null;
  readonly capsule: Mesh | null;
  lastX: number;
  lastZ: number;
}

interface RunState {
  stage: RunStage;
  health: number;
  battery: number;
  resolve: number;
  ammoMag: number;
  ammoReserve: number;
  hasFuse: boolean;
  powered: boolean;
  flashlightOn: boolean;
  holdoutSeconds: number;
  simTime: number;
  statusMessage: string;
  statusUntil: number;
}

interface MonsterState {
  readonly pos: Vector3;
  mode: MonsterMode;
  patrolIndex: number;
  path: Vector3[];
  repathIn: number;
  attackCooldown: number;
  stunTimer: number;
  investigateTarget: Vector3 | null;
  lostSightSeconds: number;
  yaw: number;
}

/** Internal hook surface for headless verification (player position + the controls + grounded state). */
export interface WalkSceneHandle extends HarnessScene {
  readonly game: Game;
  readonly controls: FirstPersonControls;
  /** The local player's current world position, read from the ECS Transform. */
  playerPosition(): { x: number; y: number; z: number };
  setRemoteWorld(world: GameWorld | undefined): void;
  readonly grounded: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function dist2d(a: { readonly x: number; readonly z: number }, b: { readonly x: number; readonly z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function cellKey(ix: number, iz: number): string {
  return `${ix},${iz}`;
}

function edgeKey(a: { readonly ix: number; readonly iz: number }, b: { readonly ix: number; readonly iz: number }): string {
  const ak = cellKey(a.ix, a.iz);
  const bk = cellKey(b.ix, b.iz);
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

function cellCenter(cell: ShipCell): Vector3 {
  return new Vector3(cell.ix * SHIP_CELL_SIZE, 1, cell.iz * SHIP_CELL_SIZE);
}

function nearestCell(level: CorridorLevel, pos: { readonly x: number; readonly z: number }): ShipCell {
  let best = level.cells[0];
  if (!best) throw new Error('ship level has no nav cells');
  let bestD = Infinity;
  for (const cell of level.cells) {
    const dx = cell.ix * SHIP_CELL_SIZE - pos.x;
    const dz = cell.iz * SHIP_CELL_SIZE - pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      best = cell;
      bestD = d;
    }
  }
  return best;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createRunSeed(): number {
  const raw = new URLSearchParams(location.search).get('seed');
  const explicit = raw ? Number(raw) : NaN;
  if (Number.isFinite(explicit)) return explicit >>> 0;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 1;
}

function doorEdge(door: ShipDoor): string {
  if (door.half[0] < door.half[2]) {
    const iz = Math.round(door.pos[2] / SHIP_CELL_SIZE);
    const leftIx = Math.round((door.pos[0] - SHIP_CELL_SIZE / 2) / SHIP_CELL_SIZE);
    return edgeKey({ ix: leftIx, iz }, { ix: leftIx + 1, iz });
  }

  const ix = Math.round(door.pos[0] / SHIP_CELL_SIZE);
  const lowIz = Math.round((door.pos[2] - SHIP_CELL_SIZE / 2) / SHIP_CELL_SIZE);
  return edgeKey({ ix, iz: lowIz }, { ix, iz: lowIz + 1 });
}

function isDoorUnlocked(door: ShipDoor, run: RunState): boolean {
  if (door.unlock === 'power') return run.powered;
  if (door.unlock === 'fuse') return run.hasFuse || run.stage === 'holdout' || run.stage === 'extract' || run.stage === 'won';
  return run.stage === 'extract' || run.stage === 'won';
}

function closedDoorEdges(level: CorridorLevel, run: RunState): Set<string> {
  const blocked = new Set<string>();
  for (const door of level.doors) {
    if (!isDoorUnlocked(door, run)) blocked.add(doorEdge(door));
  }
  return blocked;
}

function findPath(level: CorridorLevel, from: Vector3, to: Vector3, blockedEdges: Set<string>): Vector3[] {
  const occupied = new Set(level.cells.map((cell) => cellKey(cell.ix, cell.iz)));
  const byKey = new Map(level.cells.map((cell) => [cellKey(cell.ix, cell.iz), cell] as const));
  const start = nearestCell(level, from);
  const goal = nearestCell(level, to);
  const startKey = cellKey(start.ix, start.iz);
  const goalKey = cellKey(goal.ix, goal.iz);
  if (startKey === goalKey) return [to.clone()];

  const queue = [start];
  const cameFrom = new Map<string, string | null>([[startKey, null]]);
  for (let qi = 0; qi < queue.length; qi++) {
    const current = queue[qi]!;
    if (cellKey(current.ix, current.iz) === goalKey) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = { ix: current.ix + dx, iz: current.iz + dz };
      const nextKey = cellKey(next.ix, next.iz);
      if (!occupied.has(nextKey) || cameFrom.has(nextKey)) continue;
      if (blockedEdges.has(edgeKey(current, next))) continue;
      cameFrom.set(nextKey, cellKey(current.ix, current.iz));
      const nextCell = byKey.get(nextKey);
      if (nextCell) queue.push(nextCell);
    }
  }

  if (!cameFrom.has(goalKey)) return [];
  const reversed: ShipCell[] = [];
  let key: string | null = goalKey;
  while (key && key !== startKey) {
    const cell = byKey.get(key);
    if (cell) reversed.push(cell);
    key = cameFrom.get(key) ?? null;
  }
  reversed.reverse();
  const path = reversed.map(cellCenter);
  path.push(to.clone());
  return path;
}

function hasGridLineOfSight(level: CorridorLevel, run: RunState, a: Vector3, b: Vector3): boolean {
  const ac = nearestCell(level, a);
  const bc = nearestCell(level, b);
  if (ac.ix !== bc.ix && ac.iz !== bc.iz) return dist2d(a, b) < 3.2;

  const occupied = new Set(level.cells.map((cell) => cellKey(cell.ix, cell.iz)));
  const blocked = closedDoorEdges(level, run);
  const stepIx = Math.sign(bc.ix - ac.ix);
  const stepIz = Math.sign(bc.iz - ac.iz);
  let cursor = { ix: ac.ix, iz: ac.iz };
  while (cursor.ix !== bc.ix || cursor.iz !== bc.iz) {
    const next = { ix: cursor.ix + stepIx, iz: cursor.iz + stepIz };
    if (!occupied.has(cellKey(next.ix, next.iz))) return false;
    if (blocked.has(edgeKey(cursor, next))) return false;
    cursor = next;
  }
  return true;
}

function playerInDoor(door: ShipDoor, pos: { readonly x: number; readonly z: number }): boolean {
  return Math.abs(pos.x - door.pos[0]) <= door.half[0] + PLAYER_RADIUS
    && Math.abs(pos.z - door.pos[2]) <= door.half[2] + PLAYER_RADIUS;
}

function fuseHint(pickup: ShipPickup): string {
  if (pickup.id.includes('storage')) return 'storage bay';
  if (pickup.id.includes('med')) return 'medical bay';
  return 'maintenance loop';
}

function objectiveText(run: RunState, activeFuse: ShipPickup): string {
  switch (run.stage) {
    case 'restorePower':
      return 'restore power in engineering';
    case 'findFuse':
      return `find the comms fuse in ${fuseHint(activeFuse)}`;
    case 'installFuse':
      return 'install the fuse at the comms relay';
    case 'holdout':
      return `survive the attack ${Math.ceil(run.holdoutSeconds)}s`;
    case 'extract':
      return 'return to the docking airlock';
    case 'won':
      return 'signal restored - run complete';
    case 'dead':
      return 'signal lost - crew down';
  }
}

function statusText(run: RunState, monster: MonsterState, grounded: boolean): string {
  if (run.statusUntil > run.simTime) return run.statusMessage;
  return `${grounded ? 'grounded' : 'airborne'} · ${run.flashlightOn ? 'light' : 'dark'} · monster ${monster.mode}`;
}

/**
 * The playable vertical slice (the first time every layer runs together): a branching greybox ship
 * with matching Rapier static colliders, an ECS LocalPlayer driven by KCC movement, objectives,
 * pickups, soft doors, flashlight survival pressure, and a host-side monster director.
 */
export async function createWalkScene(
  profile: RenderProfile,
  canvas: HTMLCanvasElement,
  opts: WalkSceneOptions = {},
): Promise<WalkSceneHandle> {
  const scene = new Scene();
  const corridor = buildCorridor(scene);
  const { colliders, level } = corridor;
  const playerUnitFactory = await loadPlayerUnitFactory();
  const seed = createRunSeed();
  const rng = mulberry32(seed);
  const fuseOptions = level.pickups.filter((pickup) => pickup.variantGroup === 'fuse');
  const activeFuse = fuseOptions[Math.floor(rng() * fuseOptions.length)];
  if (!activeFuse) throw new Error('ship level needs at least one fuse pickup');

  // Shared game root. Spawn in the docking bay, facing -Z into the ship.
  const spawn = level.playerSpawn;
  const playerStart = opts.thirdPerson ? { ...spawn, z: spawn.z - 4 } : spawn;
  const game = await Game.create({
    role: 'host',
    initialPlayerPosition: playerStart,
    configurePhysics: (physics) => {
      for (const b of colliders) {
        physics.addStaticBox(
          { x: b.pos[0], y: b.pos[1], z: b.pos[2] },
          { x: b.half[0], y: b.half[1], z: b.half[2] },
        );
      }
    },
  });
  const playerEid = game.playerEid;
  const controls = createFirstPersonControls(canvas);

  const run: RunState = {
    stage: 'restorePower',
    health: 100,
    battery: 100,
    resolve: 100,
    ammoMag: 3,
    ammoReserve: 0,
    hasFuse: false,
    powered: false,
    flashlightOn: true,
    holdoutSeconds: HOLDOUT_SECONDS,
    simTime: 0,
    statusMessage: `seed ${seed}`,
    statusUntil: 3,
  };
  Health.hp[playerEid] = run.health;
  PlayerState.health[playerEid] = run.health;
  PlayerState.battery[playerEid] = run.battery;
  PlayerState.resolve[playerEid] = run.resolve;
  PlayerState.ammoMag[playerEid] = run.ammoMag;
  PlayerState.ammoReserve[playerEid] = run.ammoReserve;

  const camera = new PerspectiveCamera(70, 1, 0.1, 80);
  const flashlight = createFlashlight(profile);
  flashlight.addToScene(scene);
  flashlight.setOn(run.flashlightOn);
  const localUnit = opts.thirdPerson ? playerUnitFactory?.createInstance() ?? null : null;
  if (localUnit) scene.add(localUnit.root);
  const localUnitFill = localUnit ? new PointLight(0xd8eaff, 18, 7, 2) : null;
  if (localUnitFill) scene.add(localUnitFill);

  const doorMat = new MeshStandardMaterial({ color: 0x26323a, emissive: 0x2b0808, emissiveIntensity: 0.8, roughness: 0.72 });
  const stationMat = new MeshStandardMaterial({ color: 0x2f4953, emissive: 0x12606e, emissiveIntensity: 0.85, roughness: 0.55 });
  const pickupMat = new MeshStandardMaterial({ color: 0xd8c65a, emissive: 0xd8c65a, emissiveIntensity: 0.9, roughness: 0.4 });
  const fuseMat = new MeshStandardMaterial({ color: 0x9fd0ff, emissive: 0x65b7ff, emissiveIntensity: 1.25, roughness: 0.4 });
  const monsterMat = new MeshStandardMaterial({ color: 0x20181a, emissive: 0x6b1111, emissiveIntensity: 0.8, roughness: 0.8 });
  const monsterEyeMat = new MeshStandardMaterial({ color: 0xffc36a, emissive: 0xff5f33, emissiveIntensity: 2.2, roughness: 0.3 });

  const doorMeshes = level.doors.map((door) => {
    const mesh = new Mesh(new BoxGeometry(door.half[0] * 2, door.half[1] * 2, door.half[2] * 2), doorMat);
    mesh.position.set(door.pos[0], door.pos[1], door.pos[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { door, mesh };
  });

  const stationMeshes = level.stations.map((station) => {
    const mesh = new Mesh(new BoxGeometry(0.52, 0.9, 0.26), stationMat);
    mesh.position.set(station.pos[0], station.pos[1], station.pos[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { station, mesh };
  });

  const collectedPickups = new Set<string>();
  const pickupMeshes = level.pickups.map((pickup) => {
    const material = pickup.kind === 'fuse' ? fuseMat : pickupMat;
    const mesh = new Mesh(new BoxGeometry(0.42, 0.42, 0.42), material);
    mesh.position.set(pickup.pos[0], pickup.pos[1], pickup.pos[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = pickup.variantGroup !== 'fuse' || pickup.id === activeFuse.id;
    scene.add(mesh);
    return { pickup, mesh };
  });

  const monsterRoot = new Object3D();
  const monsterBody = new Mesh(new CapsuleGeometry(0.46, 1.15, 6, 10), monsterMat);
  monsterBody.position.y = 0.35;
  monsterBody.castShadow = true;
  monsterBody.receiveShadow = true;
  monsterRoot.add(monsterBody);
  for (const x of [-0.15, 0.15]) {
    const eye = new Mesh(new BoxGeometry(0.09, 0.07, 0.06), monsterEyeMat);
    eye.position.set(x, 0.85, -0.42);
    monsterRoot.add(eye);
  }
  scene.add(monsterRoot);
  const monster: MonsterState = {
    pos: new Vector3(level.monsterSpawn.x, level.monsterSpawn.y, level.monsterSpawn.z),
    mode: 'patrol',
    patrolIndex: Math.floor(rng() * level.patrolNodes.length),
    path: [],
    repathIn: 0,
    attackCooldown: 0,
    stunTimer: 0,
    investigateTarget: null,
    lostSightSeconds: 0,
    yaw: 0,
  };

  const remoteMat = new MeshStandardMaterial({ color: 0x4db7ff, emissive: 0x0b2435, roughness: 0.75 });
  const remoteGeo = new CapsuleGeometry(0.33, 0.9, 5, 8);
  const remoteVisuals = new Map<number, RemotePlayerVisual>();
  let remoteWorld: GameWorld | undefined;
  let localMoving = false;
  let lastLocalX = Transform.x[playerEid] ?? spawn.x;
  let lastLocalZ = Transform.z[playerEid] ?? spawn.z;

  const flashStatus = (message: string, seconds = 2): void => {
    run.statusMessage = message;
    run.statusUntil = run.simTime + seconds;
  };

  const playerPos = (): Vector3 => new Vector3(Transform.x[playerEid]!, Transform.y[playerEid]!, Transform.z[playerEid]!);

  const euler = new Euler(0, 0, 0, 'YXZ');
  const cameraTarget = new Vector3();
  const cameraOffset = new Vector3();
  const flashlightRig = new Object3D();
  // `!` - typed-array reads are `number | undefined` under noUncheckedIndexedAccess; the eid is valid.
  const placeCamera = (): void => {
    const x = Transform.x[playerEid]!;
    const y = Transform.y[playerEid]!;
    const z = Transform.z[playerEid]!;
    if (localUnit) {
      cameraTarget.set(x, y + THIRD_PERSON_TARGET_HEIGHT, z);
      cameraOffset.set(Math.sin(controls.yaw) * THIRD_PERSON_DISTANCE, THIRD_PERSON_HEIGHT, Math.cos(controls.yaw) * THIRD_PERSON_DISTANCE);
      camera.position.copy(cameraTarget).add(cameraOffset);
      camera.lookAt(cameraTarget);
      localUnitFill?.position.copy(camera.position);
      flashlightRig.position.set(x, y + EYE_OFFSET, z);
      euler.set(controls.pitch, controls.yaw, 0);
      flashlightRig.quaternion.setFromEuler(euler);
      flashlight.update(flashlightRig as never);
    } else {
      camera.position.set(x, y + EYE_OFFSET, z);
      euler.set(controls.pitch, controls.yaw, 0);
      camera.quaternion.setFromEuler(euler);
      flashlight.update(camera);
    }
  };
  const yawFromTransform = (eid: number): number => {
    const x = Transform.qx[eid] ?? 0;
    const y = Transform.qy[eid] ?? 0;
    const z = Transform.qz[eid] ?? 0;
    const w = Transform.qw[eid] ?? 1;
    return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
  };
  const createRemoteVisual = (factory: PlayerUnitFactory | null, x: number, y: number, z: number): RemotePlayerVisual => {
    const unit = factory?.createInstance() ?? null;
    if (unit) {
      unit.update({ x, y, z, yaw: 0, moving: false }, 0);
      scene.add(unit.root);
      return { root: unit.root, unit, capsule: null, lastX: x, lastZ: z };
    }

    const capsule = new Mesh(remoteGeo, remoteMat);
    capsule.castShadow = true;
    capsule.receiveShadow = true;
    capsule.position.set(x, y + 0.15, z);
    scene.add(capsule);
    return { root: capsule, unit: null, capsule, lastX: x, lastZ: z };
  };
  const removeRemoteVisual = (visual: RemotePlayerVisual): void => {
    visual.unit?.dispose();
    scene.remove(visual.root);
  };
  const syncRemoteMarkers = (dt = 0): void => {
    if (!remoteWorld) {
      for (const visual of remoteVisuals.values()) removeRemoteVisual(visual);
      remoteVisuals.clear();
      return;
    }

    const seen = new Set<number>();
    for (const eid of queryRemotePlayers(remoteWorld)) {
      seen.add(eid);
      const x = Transform.x[eid] ?? 0;
      const y = Transform.y[eid] ?? 1;
      const z = Transform.z[eid] ?? 0;
      let visual = remoteVisuals.get(eid);
      if (!visual) {
        visual = createRemoteVisual(playerUnitFactory, x, y, z);
        remoteVisuals.set(eid, visual);
      }

      const moving = Math.hypot(x - visual.lastX, z - visual.lastZ) > 0.001;
      visual.lastX = x;
      visual.lastZ = z;
      if (visual.unit) {
        visual.unit.update({ x, y, z, yaw: yawFromTransform(eid), moving }, dt);
      } else if (visual.capsule) {
        visual.capsule.position.set(x, y + 0.15, z);
      }
    }
    for (const [eid, visual] of remoteVisuals) {
      if (seen.has(eid)) continue;
      removeRemoteVisual(visual);
      remoteVisuals.delete(eid);
    }
  };

  const blockedDoorsNear = (pos: Vector3): ShipDoor | null => {
    for (const door of level.doors) {
      if (!isDoorUnlocked(door, run) && dist2d(pos, { x: door.pos[0], z: door.pos[2] }) < 2.15) return door;
    }
    return null;
  };

  const nearestStation = (pos: Vector3): ShipStation | null => {
    let best: ShipStation | null = null;
    let bestD = Infinity;
    for (const station of level.stations) {
      const d = dist2d(pos, { x: station.pos[0], z: station.pos[2] });
      if (d < station.radius && d < bestD) {
        best = station;
        bestD = d;
      }
    }
    return best;
  };

  const addPickup = (pickup: ShipPickup): void => {
    if (pickup.kind === 'fuse') {
      run.hasFuse = true;
      if (run.stage === 'findFuse') run.stage = 'installFuse';
      flashStatus('fuse acquired - comms door unlocked', 3);
    } else if (pickup.kind === 'battery') {
      run.battery = clamp(run.battery + pickup.amount, 0, 100);
      flashStatus('battery recovered', 2);
    } else if (pickup.kind === 'medkit') {
      run.health = clamp(run.health + pickup.amount, 0, 100);
      flashStatus('med kit used', 2);
    } else {
      run.ammoMag = clamp(run.ammoMag + pickup.amount, 0, 9);
      flashStatus('stun cells loaded', 2);
    }
  };

  const collectPickups = (pos: Vector3): void => {
    for (const { pickup, mesh } of pickupMeshes) {
      if (collectedPickups.has(pickup.id) || !mesh.visible) continue;
      if (pickup.variantGroup === 'fuse' && pickup.id !== activeFuse.id) continue;
      if (dist2d(pos, { x: pickup.pos[0], z: pickup.pos[2] }) > pickup.radius) continue;
      collectedPickups.add(pickup.id);
      mesh.visible = false;
      addPickup(pickup);
    }
  };

  const handleInteract = (pos: Vector3): number => {
    const station = nearestStation(pos);
    if (!station) {
      const door = blockedDoorsNear(pos);
      if (door) {
        const reason = door.unlock === 'power' ? 'restore power first' : door.unlock === 'fuse' ? 'find the comms fuse first' : 'survive the attack first';
        flashStatus(`${door.label}: ${reason}`, 2.4);
        return 0.25;
      }
      flashStatus('nothing in reach', 1.2);
      return 0;
    }

    if (station.kind === 'power' && run.stage === 'restorePower') {
      run.powered = true;
      run.stage = 'findFuse';
      monster.mode = 'investigate';
      monster.investigateTarget = pos.clone();
      monster.repathIn = 0;
      flashStatus('power restored - find the comms fuse', 3);
      return 0.7;
    }
    if (station.kind === 'comms' && run.stage === 'installFuse') {
      run.stage = 'holdout';
      run.holdoutSeconds = HOLDOUT_SECONDS;
      monster.mode = 'chase';
      monster.repathIn = 0;
      flashStatus('transmitter charging - survive', 3);
      return 1;
    }
    if (station.kind === 'extract' && run.stage === 'extract') {
      run.stage = 'won';
      flashStatus('signal restored', 10);
      return 0.5;
    }

    flashStatus(`${station.label}: not ready`, 1.8);
    return 0.1;
  };

  const handleFire = (pos: Vector3): number => {
    if (run.ammoMag <= 0) {
      flashStatus('no stun cells', 1.5);
      return 0.2;
    }
    run.ammoMag -= 1;
    const toMonster = monster.pos.clone().sub(pos);
    const range = Math.hypot(toMonster.x, toMonster.z);
    const forward = new Vector3(-Math.sin(controls.yaw), 0, -Math.cos(controls.yaw));
    toMonster.y = 0;
    if (range > 0.001) toMonster.normalize();
    const hit = range < 8.5 && forward.dot(toMonster) > 0.68 && hasGridLineOfSight(level, run, pos, monster.pos);
    if (hit) {
      monster.mode = 'stunned';
      monster.stunTimer = 3.2;
      monster.path = [];
      monster.repathIn = 0;
      flashStatus('monster stunned', 2.2);
    } else {
      flashStatus('stun pulse missed', 1.2);
      monster.mode = 'investigate';
      monster.investigateTarget = pos.clone();
    }
    return 1.2;
  };

  const moveMonster = (dt: number, target: Vector3, speed: number): void => {
    monster.repathIn -= dt;
    if (monster.repathIn <= 0) {
      monster.path = findPath(level, monster.pos, target, closedDoorEdges(level, run));
      monster.repathIn = monster.mode === 'chase' ? 0.22 : 0.45;
    }
    let waypoint = monster.path[0] ?? target;
    if (dist2d(monster.pos, waypoint) < 0.35 && monster.path.length > 0) {
      monster.path.shift();
      waypoint = monster.path[0] ?? target;
    }

    const dx = waypoint.x - monster.pos.x;
    const dz = waypoint.z - monster.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const step = Math.min(speed * dt, len);
    monster.pos.x += (dx / len) * step;
    monster.pos.z += (dz / len) * step;
    monster.yaw = Math.atan2(-dx / len, -dz / len);
  };

  const damagePlayer = (amount: number): void => {
    run.health = clamp(run.health - amount, 0, 100);
    run.resolve = clamp(run.resolve - amount * 0.75, 0, 100);
    flashStatus('monster hit', 1.1);
    if (run.health <= 0) {
      run.stage = 'dead';
      run.flashlightOn = false;
      flashlight.setOn(false);
      flashStatus('crew down', 10);
    }
  };

  const updateMonster = (dt: number, pos: Vector3, playerNoise: number): void => {
    if (run.stage === 'won' || run.stage === 'dead') return;

    monster.attackCooldown = Math.max(0, monster.attackCooldown - dt);
    if (monster.stunTimer > 0) {
      monster.stunTimer -= dt;
      monster.mode = 'stunned';
      monsterMat.emissiveIntensity = 1.4 + Math.sin(run.simTime * 34) * 0.4;
      if (monster.stunTimer <= 0) {
        monster.mode = 'investigate';
        monster.investigateTarget = pos.clone();
      }
      return;
    }
    monsterMat.emissiveIntensity = monster.mode === 'chase' || monster.mode === 'attack' ? 1.35 : 0.75;

    const distance = dist2d(monster.pos, pos);
    const canSeePlayer = hasGridLineOfSight(level, run, monster.pos, pos) && distance < (run.flashlightOn ? 16 : 5.2);
    const heardPlayer = playerNoise > 0 && distance < 7 + playerNoise * 15;

    if (run.stage === 'holdout') {
      monster.mode = distance < 1.35 ? 'attack' : 'chase';
      monster.investigateTarget = pos.clone();
    } else if (canSeePlayer) {
      monster.mode = distance < 1.35 ? 'attack' : 'chase';
      monster.lostSightSeconds = 0;
    } else if (monster.mode === 'chase' || monster.mode === 'attack') {
      monster.lostSightSeconds += dt;
      if (monster.lostSightSeconds > 4) {
        monster.mode = 'investigate';
        monster.investigateTarget = pos.clone();
        monster.lostSightSeconds = 0;
      }
    } else if (heardPlayer) {
      monster.mode = 'investigate';
      monster.investigateTarget = pos.clone();
      monster.repathIn = 0;
    }

    if (monster.mode === 'attack') {
      if (distance > 1.55) {
        monster.mode = 'chase';
      } else if (monster.attackCooldown <= 0) {
        damagePlayer(run.stage === 'holdout' ? 22 : 16);
        monster.attackCooldown = 1.35;
      }
      moveMonster(dt, pos, 1.2);
      return;
    }

    if (monster.mode === 'chase') {
      moveMonster(dt, pos, run.stage === 'holdout' ? 3.05 : 2.45);
      return;
    }

    if (monster.mode === 'investigate' && monster.investigateTarget) {
      moveMonster(dt, monster.investigateTarget, 1.75);
      if (dist2d(monster.pos, monster.investigateTarget) < 0.7) {
        monster.mode = 'patrol';
        monster.investigateTarget = null;
      }
      return;
    }

    const patrol = level.patrolNodes[monster.patrolIndex % level.patrolNodes.length];
    if (!patrol) return;
    const target = new Vector3(patrol.pos[0], patrol.pos[1], patrol.pos[2]);
    moveMonster(dt, target, 1.1);
    if (dist2d(monster.pos, target) < 0.7) {
      monster.patrolIndex = (monster.patrolIndex + 1) % level.patrolNodes.length;
      monster.repathIn = 0;
    }
  };

  const syncRunToEcs = (): void => {
    Health.hp[playerEid] = run.health;
    PlayerState.health[playerEid] = run.health;
    PlayerState.battery[playerEid] = run.battery;
    PlayerState.resolve[playerEid] = run.resolve;
    PlayerState.ammoMag[playerEid] = run.ammoMag;
    PlayerState.ammoReserve[playerEid] = run.ammoReserve;
  };

  placeCamera();

  return {
    scene,
    camera,
    label: 'walk',
    game,
    controls,
    get grounded() {
      return game.playerController.isGrounded;
    },
    playerPosition() {
      return { x: Transform.x[playerEid]!, y: Transform.y[playerEid]!, z: Transform.z[playerEid]! };
    },
    setRemoteWorld(world) {
      remoteWorld = world;
      syncRemoteMarkers();
    },
    fixedStep(dt) {
      run.simTime += dt;
      let playerNoise = 0;
      const before = playerPos();

      if (controls.consumeFlashlightToggle()) {
        run.flashlightOn = run.battery > 0 ? !run.flashlightOn : false;
        flashlight.setOn(run.flashlightOn);
        flashStatus(run.flashlightOn ? 'flashlight on' : 'flashlight off', 1.4);
        playerNoise += 0.2;
      }

      const active = run.stage !== 'dead' && run.stage !== 'won';
      const mv = active ? controls.moveVector() : { x: 0, z: 0 };
      const speedMultiplier = controls.crouching ? 0.55 : controls.sprinting ? 1.45 : 1;
      game.setInput({
        moveX: mv.x,
        moveZ: mv.z,
        yaw: controls.yaw,
        jump: active ? controls.consumeJump() : false,
        speedMultiplier,
      });
      game.stepFixed(dt);

      let pos = playerPos();
      for (const door of level.doors) {
        if (isDoorUnlocked(door, run) || !playerInDoor(door, pos)) continue;
        game.setControlledPlayerPose(playerEid, { x: before.x, y: before.y, z: before.z, yaw: controls.yaw });
        pos = before.clone();
        flashStatus(`${door.label} locked`, 1.2);
        break;
      }

      localMoving = Math.hypot(Transform.x[playerEid]! - lastLocalX, Transform.z[playerEid]! - lastLocalZ) > 0.001;
      lastLocalX = Transform.x[playerEid]!;
      lastLocalZ = Transform.z[playerEid]!;

      if (localMoving) playerNoise += controls.crouching ? 0.1 : controls.sprinting ? 0.75 : 0.32;
      if (run.flashlightOn) {
        run.battery = clamp(run.battery - dt * (controls.sprinting ? 2.9 : 1.8), 0, 100);
        if (run.battery <= 0) {
          run.flashlightOn = false;
          flashlight.setOn(false);
          flashStatus('battery empty', 2);
        }
      }

      const monsterDistance = dist2d(monster.pos, pos);
      run.resolve = clamp(
        run.resolve
          + (run.flashlightOn ? 0.55 : -0.4) * dt
          - (monsterDistance < 8 ? (8 - monsterDistance) * 0.7 * dt : 0)
          - (monster.mode === 'chase' || monster.mode === 'attack' ? 2.2 * dt : 0),
        0,
        100,
      );

      collectPickups(pos);
      if (active && controls.consumeInteract()) playerNoise += handleInteract(pos);
      if (active && controls.consumeFire()) playerNoise += handleFire(pos);

      if (run.stage === 'holdout') {
        run.holdoutSeconds = Math.max(0, run.holdoutSeconds - dt);
        if (run.holdoutSeconds <= 0) {
          run.stage = 'extract';
          flashStatus('transmitter online - return to airlock', 4);
        }
      }

      updateMonster(dt, pos, playerNoise);
      syncRunToEcs();
      hudSync({
        health: Math.round(run.health),
        battery: Math.round(run.battery),
        resolve: Math.round(run.resolve),
        ammoMag: Math.round(run.ammoMag),
        ammoReserve: Math.round(run.ammoReserve),
        objective: objectiveText(run, activeFuse),
        status: statusText(run, monster, game.playerController.isGrounded),
      });
    },
    frameUpdate(dt) {
      corridor.update(dt);
      const t = run.simTime;
      for (const { door, mesh } of doorMeshes) {
        const open = isDoorUnlocked(door, run);
        mesh.position.y += (((open ? door.pos[1] + 2.5 : door.pos[1]) - mesh.position.y) * Math.min(1, dt * 8));
      }
      for (const { station, mesh } of stationMeshes) {
        const ready = (station.kind === 'power' && run.stage === 'restorePower')
          || (station.kind === 'comms' && run.stage === 'installFuse')
          || (station.kind === 'extract' && run.stage === 'extract');
        mesh.scale.setScalar(ready ? 1 + Math.sin(t * 8) * 0.035 : 1);
      }
      for (const { pickup, mesh } of pickupMeshes) {
        if (!mesh.visible || collectedPickups.has(pickup.id)) continue;
        mesh.rotation.y += dt * 1.8;
        mesh.position.y = pickup.pos[1] + Math.sin(t * 3 + pickup.pos[0]) * 0.08;
      }
      monsterRoot.position.copy(monster.pos);
      monsterRoot.rotation.y = monster.yaw;
      monsterRoot.scale.setScalar(monster.mode === 'stunned' ? 0.92 + Math.sin(t * 38) * 0.025 : 1);
      localUnit?.update(
        {
          x: Transform.x[playerEid]!,
          y: Transform.y[playerEid]!,
          z: Transform.z[playerEid]!,
          yaw: controls.yaw,
          moving: localMoving,
        },
        dt,
      );
      placeCamera();
      syncRemoteMarkers(dt);
    },
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      controls.dispose();
      localUnit?.dispose();
      if (localUnit) scene.remove(localUnit.root);
      if (localUnitFill) scene.remove(localUnitFill);
      for (const visual of remoteVisuals.values()) removeRemoteVisual(visual);
      for (const { mesh } of doorMeshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      for (const { mesh } of stationMeshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      for (const { mesh } of pickupMeshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      scene.remove(monsterRoot);
      monsterBody.geometry.dispose();
      doorMat.dispose();
      stationMat.dispose();
      pickupMat.dispose();
      fuseMat.dispose();
      monsterMat.dispose();
      monsterEyeMat.dispose();
      remoteGeo.dispose();
      remoteMat.dispose();
      game.dispose();
    },
  };
}
