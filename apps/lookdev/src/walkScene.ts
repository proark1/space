import {
  AdditiveBlending,
  BoxGeometry,
  CapsuleGeometry,
  Euler,
  Mesh,
  MeshBasicMaterial,
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
import { loadMonsterUnitFactory, type MonsterUnitInstance } from './monsterUnit';
import { loadPlayerUnitFactory, type PlayerUnitFactory, type PlayerUnitInstance } from './playerUnit';
import {
  createMicVoiceInput,
  voiceSignalFromCommand,
  voiceSignalFromPressure,
  type ActiveVoiceLevel,
  type MicVoiceStatus,
  type VoiceCommand,
  type VoiceLevel,
  type VoiceSignal,
  type VoiceSource,
} from './voiceInput';

/** Eye height above the capsule centre. Capsule rest centre ≈1.0 (radius .4 + halfHeight .6) ⇒ eye ≈1.62. */
const EYE_OFFSET = 0.62;
const THIRD_PERSON_DISTANCE = 3.2;
const THIRD_PERSON_HEIGHT = 0.72;
const THIRD_PERSON_TARGET_HEIGHT = 0.9;
const PLAYER_RADIUS = 0.48;
const HOLDOUT_SECONDS = 55;
const SAFE_ROOM_ZONE = 'med';
const SAFE_ROOM_GUARD = new Vector3(0, 1, -4);
const FIRST_ENCOUNTER_START = new Vector3(1.65, 1, -12);
const FIRST_ENCOUNTER_END = new Vector3(-1.65, 1, -12);
const LIGHT_EXPOSURE_DECAY = 0.34;
const LIGHT_EXPOSURE_GAIN = 0.42;
const LIGHT_TOGGLE_EXPOSURE = 0.28;
const DARK_CREW_FULL_RANGE = 2.5;
const DARK_CREW_OUTLINE_RANGE = 5.2;
const SMOKE_REMOTE_NET_ID = 0x51_05;
const SLICK_ZONES = [
  { x: 8.7, z: -13.2, radius: 4.7, label: 'slick engineering deck' },
  { x: -0.9, z: -36.8, radius: 3.6, label: 'wet comms deck' },
] as const;

export interface WalkSceneOptions {
  readonly thirdPerson?: boolean;
}

type RunStage = 'restorePower' | 'findFuse' | 'installFuse' | 'holdout' | 'extract' | 'won' | 'dead';
type MonsterMode = 'patrol' | 'investigate' | 'chase' | 'attack' | 'stunned';
type EncounterPhase = 'idle' | 'telegraph' | 'cross' | 'recover' | 'done';
type ScarePhase = 'lull' | 'build' | 'peak' | 'relax';
export interface SmokePose {
  readonly x: number;
  readonly y?: number;
  readonly z: number;
  readonly yaw?: number;
}

export interface SmokeRemotePose extends SmokePose {
  readonly netId?: number;
}

export interface WalkRunStateView {
  readonly stage: RunStage;
  readonly health: number;
  readonly battery: number;
  readonly resolve: number;
  readonly ammoMag: number;
  readonly ammoReserve: number;
  readonly hasFuse: boolean;
  readonly powered: boolean;
  readonly flashlightOn: boolean;
  readonly holdoutSeconds: number;
  readonly simTime: number;
  readonly status: string;
  readonly inSafeRoom: boolean;
  readonly tension: number;
  readonly commsCharge: number;
  readonly lightExposure: number;
  readonly soundPressure: number;
  readonly voiceLevel: VoiceLevel;
  readonly activeVoice: ActiveVoiceLevel | null;
  readonly voiceSource: VoiceSource | null;
  readonly micVoiceStatus: MicVoiceStatus;
  readonly scarePhase: ScarePhase;
  readonly scareDebt: number;
  readonly inSlickZone: boolean;
  readonly nearbyCrew: number;
  readonly encounterPhase: EncounterPhase;
  readonly encounterTimer: number;
  readonly activeFuse: {
    readonly id: string;
    readonly pos: { readonly x: number; readonly y: number; readonly z: number };
  };
  readonly collectedPickupIds: readonly string[];
  readonly doors: ReadonlyArray<{
    readonly id: string;
    readonly unlock: string;
    readonly unlocked: boolean;
  }>;
  readonly stations: ReadonlyArray<{
    readonly id: string;
    readonly kind: string;
    readonly pos: { readonly x: number; readonly y: number; readonly z: number };
  }>;
  readonly pickups: ReadonlyArray<{
    readonly id: string;
    readonly kind: string;
    readonly active: boolean;
    readonly collected: boolean;
    readonly pos: { readonly x: number; readonly y: number; readonly z: number };
  }>;
}

export interface MonsterStateView {
  readonly mode: MonsterMode;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly attackCooldown: number;
  readonly attackWindup: number;
  readonly stunTimer: number;
}

export interface WalkUiFeedbackView {
  readonly promptText: string;
  readonly promptVisible: boolean;
  readonly damageFlash: number;
  readonly damageFlashOpacity: number;
  readonly endVisible: boolean;
  readonly endTitle: string;
  readonly endDetail: string;
  readonly stunBeamVisible: boolean;
  readonly monsterHitFlash: number;
  readonly radioText: string;
  readonly radioVisible: boolean;
  readonly lightExposure: number;
  readonly soundPressure: number;
  readonly scarePhase: ScarePhase;
  readonly activeVoice: ActiveVoiceLevel | null;
  readonly voiceSource: VoiceSource | null;
  readonly micVoiceStatus: MicVoiceStatus;
  readonly inSlickZone: boolean;
  readonly nearestRemoteVisibility: number;
  readonly remoteVisibleCount: number;
}

interface RemotePlayerVisual {
  readonly root: Object3D;
  readonly unit: PlayerUnitInstance | null;
  readonly capsule: Mesh | null;
  readonly capsuleMat: MeshStandardMaterial | null;
  readonly silhouette: Mesh;
  readonly silhouetteMat: MeshBasicMaterial;
  lastX: number;
  lastZ: number;
  visibility: number;
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
  tension: number;
  lightExposure: number;
  soundPressure: number;
  voiceLevel: VoiceLevel;
  activeVoice: ActiveVoiceLevel | null;
  voiceSource: VoiceSource | null;
  voiceTimer: number;
  scarePhase: ScarePhase;
  scareTimer: number;
  nextScareAt: number;
  lastScareAt: number;
  scareDebt: number;
  darkSeconds: number;
  nearbyCrew: number;
  inSlickZone: boolean;
  encounterPhase: EncounterPhase;
  encounterTimer: number;
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
  attackWindup: number;
  stunTimer: number;
  investigateTarget: Vector3 | null;
  lostSightSeconds: number;
  footstepMeters: number;
  yaw: number;
}

/** Internal hook surface for headless verification (player position + the controls + grounded state). */
export interface WalkSceneHandle extends HarnessScene {
  readonly game: Game;
  readonly controls: FirstPersonControls;
  /** The local player's current world position, read from the ECS Transform. */
  playerPosition(): { x: number; y: number; z: number };
  setRemoteWorld(world: GameWorld | undefined): void;
  runState(): WalkRunStateView;
  monsterState(): MonsterStateView;
  uiFeedback(): WalkUiFeedbackView;
  setPlayerPoseForSmoke(pose: SmokePose): void;
  setMonsterPoseForSmoke(pose: SmokePose): void;
  setRemotePoseForSmoke(pose: SmokeRemotePose): void;
  setFlashlightForSmoke(on: boolean): void;
  voiceForSmoke(command: VoiceCommand): number;
  voicePressureForSmoke(pressure: number): number;
  interactForSmoke(): number;
  fireForSmoke(): number;
  readonly grounded: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function dist2d(a: { readonly x: number; readonly z: number }, b: { readonly x: number; readonly z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function forwardFromYaw(yaw: number): Vector3 {
  return new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
}

function slicknessAt(pos: { readonly x: number; readonly z: number }): { amount: number; label: string | null } {
  let best = 0;
  let label: string | null = null;
  for (const zone of SLICK_ZONES) {
    const d = dist2d(pos, zone);
    const amount = clamp(1 - d / zone.radius, 0, 1);
    if (amount > best) {
      best = amount;
      label = zone.label;
    }
  }
  return { amount: best, label };
}

function voiceLevelFromNoise(noise: number, soundPressure: number): VoiceLevel {
  const n = Math.max(noise, soundPressure);
  if (n >= 0.86) return 'scream';
  if (n >= 0.58) return 'shout';
  if (n >= 0.26) return 'talk';
  if (n >= 0.06) return 'whisper';
  return 'silent';
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
  const footing = run.inSlickZone ? 'slick' : 'dry';
  const voice = run.activeVoice ? `${run.activeVoice}` : run.voiceLevel;
  return `${grounded ? 'grounded' : 'airborne'} · ${run.flashlightOn ? 'light' : 'dark'} · sound ${voice} · ${footing} · monster ${monster.mode}`;
}

function isSafeRoom(level: CorridorLevel, pos: { readonly x: number; readonly z: number }): boolean {
  return nearestCell(level, pos).zone === SAFE_ROOM_ZONE;
}

function commsCharge(run: RunState): number {
  if (run.stage === 'extract' || run.stage === 'won') return 1;
  if (run.stage !== 'holdout') return 0;
  return clamp(1 - run.holdoutSeconds / HOLDOUT_SECONDS, 0, 1);
}

function encounterActive(run: RunState): boolean {
  return run.encounterPhase === 'telegraph' || run.encounterPhase === 'cross' || run.encounterPhase === 'recover';
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
  const monsterUnitFactory = await loadMonsterUnitFactory();
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
  const micVoice = createMicVoiceInput();
  let micVoiceRequested = false;
  const requestMicVoice = (): void => {
    if (micVoiceRequested) return;
    micVoiceRequested = true;
    void micVoice.request();
  };
  canvas.addEventListener('pointerdown', requestMicVoice, { once: true });
  window.addEventListener('keydown', requestMicVoice, { once: true });

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
    tension: 0,
    lightExposure: 0,
    soundPressure: 0,
    voiceLevel: 'silent',
    activeVoice: null,
    voiceSource: null,
    voiceTimer: 0,
    scarePhase: 'lull',
    scareTimer: 0,
    nextScareAt: 9,
    lastScareAt: -Infinity,
    scareDebt: 0,
    darkSeconds: 0,
    nearbyCrew: 0,
    inSlickZone: false,
    encounterPhase: 'idle',
    encounterTimer: 0,
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
  const promptEl = document.getElementById('prompt');
  const tensionFillEl = document.getElementById('tensionFill');
  const commsFillEl = document.getElementById('commsFill');
  const commsMeterEl = document.getElementById('commsMeter');
  const encounterFlashEl = document.getElementById('encounterFlash');
  const damageFlashEl = document.getElementById('damageFlash');
  const radioLineEl = document.getElementById('radioLine');
  const endScreenEl = document.getElementById('endScreen');
  const endTitleEl = document.getElementById('endTitle');
  const endDetailEl = document.getElementById('endDetail');
  document.getElementById('restartRun')?.addEventListener('click', () => location.reload());
  let damageFlash = 0;
  let encounterFlash = 0;
  let blackoutTimer = 0;
  let radioText = '';
  let radioUntil = 0;
  let lastEndStage: RunStage | null = null;
  let lastDoorCueAt = -Infinity;
  let nextTensionPulseAt = 0;
  let monsterLungeTimer = 0;
  let lastLightAttractionAt = -Infinity;
  let lastSlickStatusAt = -Infinity;
  let lastVoiceStatusAt = -Infinity;
  let lastVoiceAttractionAt = -Infinity;
  let lastMicScreamAt = -Infinity;
  let slickMoveX = 0;
  let slickMoveZ = 0;
  const storyFlags = {
    heardLightWarning: false,
    heardDarkCrewHint: false,
    heardSoundWarning: false,
    heardCommsTrapHint: false,
    heardFirstMimic: false,
    heardVoiceSurvivalHint: false,
    heardScreamBait: false,
  };
  let audioContext: AudioContext | null = null;
  const ensureAudio = (): AudioContext | null => {
    if (typeof AudioContext === 'undefined') return null;
    try {
      audioContext ??= new AudioContext();
      if (audioContext.state === 'suspended') void audioContext.resume();
      return audioContext;
    } catch {
      return null;
    }
  };
  const playTone = (freq: number, duration: number, volume: number, type: OscillatorType, delay = 0): void => {
    const ctx = ensureAudio();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };
  const playCue = (cue: 'pickup' | 'door' | 'power' | 'comms' | 'stun' | 'hit' | 'monster' | 'step' | 'scare' | 'tension' | 'radio' | 'blackout' | 'win' | 'dead'): void => {
    if (cue === 'pickup') playTone(880, 0.12, 0.04, 'triangle');
    else if (cue === 'door') playTone(82, 0.18, 0.08, 'sawtooth');
    else if (cue === 'power') {
      playTone(120, 0.32, 0.055, 'sawtooth');
      playTone(240, 0.28, 0.035, 'triangle', 0.08);
    } else if (cue === 'comms') {
      playTone(420, 0.16, 0.045, 'square');
      playTone(620, 0.16, 0.04, 'square', 0.17);
    } else if (cue === 'stun') {
      playTone(980, 0.08, 0.06, 'sawtooth');
      playTone(1420, 0.11, 0.035, 'triangle', 0.035);
    } else if (cue === 'hit') {
      playTone(56, 0.2, 0.1, 'sawtooth');
      playTone(130, 0.08, 0.07, 'square');
    } else if (cue === 'monster') {
      playTone(70, 0.38, 0.08, 'sawtooth');
      playTone(47, 0.5, 0.055, 'square', 0.08);
    } else if (cue === 'step') {
      playTone(46, 0.08, 0.045, 'sine');
    } else if (cue === 'scare') {
      playTone(44, 0.62, 0.095, 'sawtooth');
      playTone(132, 0.18, 0.06, 'square', 0.04);
      playTone(880, 0.08, 0.035, 'triangle', 0.22);
    } else if (cue === 'tension') {
      playTone(52 + run.tension * 0.45, 0.22, 0.026 + run.tension / 4000, 'sawtooth');
    } else if (cue === 'radio') {
      playTone(610, 0.045, 0.026, 'square');
      playTone(405, 0.06, 0.018, 'sine', 0.05);
    } else if (cue === 'blackout') {
      playTone(38, 0.42, 0.09, 'sawtooth');
      playTone(910, 0.05, 0.04, 'square', 0.16);
    } else if (cue === 'win') {
      playTone(330, 0.18, 0.045, 'triangle');
      playTone(495, 0.18, 0.045, 'triangle', 0.15);
      playTone(660, 0.34, 0.04, 'triangle', 0.3);
    } else {
      playTone(88, 0.8, 0.09, 'sawtooth');
      playTone(44, 0.8, 0.07, 'square', 0.06);
    }
  };

  const doorMat = new MeshStandardMaterial({ color: 0x26323a, emissive: 0x2b0808, emissiveIntensity: 0.8, roughness: 0.72 });
  const stationMat = new MeshStandardMaterial({ color: 0x2f4953, emissive: 0x12606e, emissiveIntensity: 0.85, roughness: 0.55 });
  const pickupMat = new MeshStandardMaterial({ color: 0xd8c65a, emissive: 0xd8c65a, emissiveIntensity: 0.9, roughness: 0.4 });
  const fuseMat = new MeshStandardMaterial({ color: 0x9fd0ff, emissive: 0x65b7ff, emissiveIntensity: 1.25, roughness: 0.4 });
  const monsterMat = new MeshStandardMaterial({ color: 0x20181a, emissive: 0x6b1111, emissiveIntensity: 0.8, roughness: 0.8 });
  const monsterEyeMat = new MeshStandardMaterial({ color: 0xffc36a, emissive: 0xff5f33, emissiveIntensity: 2.2, roughness: 0.3 });
  const stunBeamMat = new MeshBasicMaterial({
    color: 0x9fdfff,
    transparent: true,
    opacity: 0.78,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const stunBeam = new Mesh(new BoxGeometry(0.08, 0.08, 1), stunBeamMat);
  stunBeam.visible = false;
  scene.add(stunBeam);
  const stunLight = new PointLight(0x9fdfff, 0, 9, 2);
  scene.add(stunLight);
  let stunBeamTimer = 0;
  let monsterHitFlash = 0;

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
  let monsterUnit: MonsterUnitInstance | null = null;
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
  monsterUnit = monsterUnitFactory?.createInstance() ?? null;
  if (monsterUnit) scene.add(monsterUnit.root);
  else scene.add(monsterRoot);
  const monster: MonsterState = {
    pos: new Vector3(level.monsterSpawn.x, level.monsterSpawn.y, level.monsterSpawn.z),
    mode: 'patrol',
    patrolIndex: Math.floor(rng() * level.patrolNodes.length),
    path: [],
    repathIn: 0,
    attackCooldown: 0,
    attackWindup: 0,
    stunTimer: 0,
    investigateTarget: null,
    lostSightSeconds: 0,
    footstepMeters: 0,
    yaw: 0,
  };

  const remoteMat = new MeshStandardMaterial({ color: 0x4db7ff, emissive: 0x0b2435, roughness: 0.75, transparent: true, opacity: 0.88 });
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

  const radioSay = (message: string, seconds = 4.2): void => {
    radioText = message;
    radioUntil = run.simTime + seconds;
    playCue('radio');
  };

  const updateRadioLine = (): void => {
    if (!radioLineEl) return;
    const visible = run.simTime < radioUntil && radioText.length > 0;
    radioLineEl.textContent = visible ? radioText : '';
    radioLineEl.style.opacity = visible ? '1' : '0';
  };

  const setFlashlightOn = (on: boolean, status = true): void => {
    const next = on && run.battery > 0;
    if (run.flashlightOn === next) return;
    run.flashlightOn = next;
    flashlight.setOn(next);
    run.lightExposure = clamp(run.lightExposure + LIGHT_TOGGLE_EXPOSURE, 0, 1);
    if (status) flashStatus(next ? 'flashlight on - light is bait' : 'flashlight off - moving dark', 1.8);
    playTone(next ? 520 : 180, 0.07, 0.035, 'square');
    if (run.powered && !storyFlags.heardLightWarning) {
      storyFlags.heardLightWarning = true;
      radioSay('VESTA: Keep the beam short. It sees what you see.');
    }
  };

  const applyVoiceSignal = (signal: VoiceSignal, pos: Vector3, dt = 0): number => {
    if (signal.level === 'silent') return 0;

    const voiceLevel = signal.level;
    const continuous = signal.source === 'mic';
    const effect = continuous ? Math.max(0, dt) : 1;
    const cueReady = !continuous || run.simTime - lastVoiceStatusAt > 4.5;
    run.activeVoice = voiceLevel;
    run.voiceSource = signal.source;
    run.voiceTimer = continuous ? 0.24 : voiceLevel === 'scream' ? 1.25 : voiceLevel === 'shout' ? 1.05 : voiceLevel === 'talk' ? 0.95 : 0.7;
    const playerSafe = isSafeRoom(level, pos);
    const crewClose = run.nearbyCrew > 0;

    if (voiceLevel === 'whisper') {
      run.resolve = clamp(run.resolve + (continuous ? (crewClose ? 0.9 : 0.25) * effect : crewClose ? 1.4 : 0.45), 0, 100);
      run.tension = clamp(run.tension - (continuous ? (crewClose ? 1.4 : 0.45) * effect : crewClose ? 3.2 : 1.4), 0, 100);
      if (cueReady) {
        lastVoiceStatusAt = run.simTime;
        flashStatus(crewClose ? 'whisper check-in - stay close' : 'whispering - stay low', 1.1);
        playTone(230, 0.04, 0.012, 'sine');
      }
      if (!storyFlags.heardVoiceSurvivalHint) {
        storyFlags.heardVoiceSurvivalHint = true;
        radioSay('VESTA: Talk to survive. Whisper to hide. A scream is a dinner bell.');
      }
      return continuous ? signal.pressure * 0.22 : 0.07;
    }

    if (voiceLevel === 'talk') {
      run.resolve = clamp(run.resolve + (continuous ? (crewClose ? 3.4 : 1.1) * effect : crewClose ? 6.5 : 2.2), 0, 100);
      run.tension = clamp(run.tension - (continuous ? (crewClose ? 2.4 : 0.55) * effect : crewClose ? 5.5 : 1.8), 0, 100);
      if (cueReady) {
        lastVoiceStatusAt = run.simTime;
        flashStatus(crewClose ? 'talk check-in - panic down' : 'talking - sound carries', 1.35);
        playTone(340, 0.055, 0.018, 'triangle');
        playTone(420, 0.045, 0.014, 'triangle', 0.07);
      }
      if (!storyFlags.heardVoiceSurvivalHint) {
        storyFlags.heardVoiceSurvivalHint = true;
        radioSay('VESTA: Talking steadies the suit network. Keep it below a shout.');
      }
      return continuous ? Math.max(signal.pressure * 0.9, 0.22) : crewClose ? 0.3 : 0.36;
    }

    if (voiceLevel === 'shout') {
      run.resolve = clamp(run.resolve - (continuous ? 2.2 * effect : 3.5), 0, 100);
      run.tension = clamp(run.tension + (continuous ? 6 * effect : 8.5), 0, 100);
      run.scareDebt = clamp(run.scareDebt + (continuous ? 0.04 * effect : 0.12), 0, 1);
      if (cueReady) {
        lastVoiceStatusAt = run.simTime;
        flashStatus('shout echoed through the deck', 1.2);
        playCue('scare');
      }
      if (!playerSafe && run.stage !== 'dead' && run.stage !== 'won' && run.simTime - lastVoiceAttractionAt > 0.85) {
        lastVoiceAttractionAt = run.simTime;
        monster.mode = 'investigate';
        monster.investigateTarget = pos.clone();
        monster.repathIn = 0;
      }
      if (!storyFlags.heardSoundWarning) {
        storyFlags.heardSoundWarning = true;
        radioSay('VESTA: Keep it under a shout. The Chorus follows pressure.');
      }
      return continuous ? signal.pressure * 1.05 : 0.74;
    }

    run.resolve = clamp(run.resolve - (continuous ? 8 * effect : 8), 0, 100);
    run.tension = clamp(run.tension + (continuous ? 14 * effect : 14), 0, 100);
    run.scareDebt = clamp(run.scareDebt + (continuous ? 0.08 * effect : 0.2), 0, 1);
    const screamCueReady = !continuous || run.simTime - lastMicScreamAt > 0.75;
    if (screamCueReady) {
      lastMicScreamAt = run.simTime;
      flashStatus('scream carried down the ship', 1.45);
      playCue('scare');
    }
    if (!storyFlags.heardScreamBait) {
      storyFlags.heardScreamBait = true;
      radioSay('VESTA: Sound is the monster. You just rang the dinner bell.');
    }
    if (!playerSafe && run.stage !== 'dead' && run.stage !== 'won') {
      monster.mode = 'chase';
      monster.investigateTarget = pos.clone();
      monster.repathIn = 0;
      monster.lostSightSeconds = 0;
      if (screamCueReady) playCue('monster');
    } else if (playerSafe) {
      monster.mode = 'investigate';
      monster.investigateTarget = SAFE_ROOM_GUARD;
      monster.repathIn = 0;
    }
    return continuous ? Math.max(signal.pressure * 1.18, 0.86) : 1.18;
  };

  const flashlightBeamHitsMonster = (pos: Vector3): boolean => {
    if (!run.flashlightOn) return false;
    const toMonster = monster.pos.clone().sub(pos);
    const range = Math.hypot(toMonster.x, toMonster.z);
    if (range > 17 || range < 0.001) return false;
    const forward = forwardFromYaw(controls.yaw);
    toMonster.y = 0;
    toMonster.normalize();
    return forward.dot(toMonster) > 0.72 && hasGridLineOfSight(level, run, pos, monster.pos);
  };

  const playerVisibilityToMonster = (pos: Vector3, distance: number): { score: number; range: number; beamHit: boolean; canSee: boolean } => {
    const beamHit = flashlightBeamHitsMonster(pos);
    let score = 0.08;
    if (run.flashlightOn) score += 0.64;
    if (beamHit) score += 0.22;
    if (!run.flashlightOn && controls.crouching) score -= 0.05;
    score += run.lightExposure * 0.16;
    score = clamp(score, 0.02, 1);
    const closeRange = !run.flashlightOn && controls.crouching ? 3.1 : 4.5;
    const range = clamp(Math.max(closeRange, 2.8 + score * 21), 2.8, 19.5);
    return {
      score,
      range,
      beamHit,
      canSee: hasGridLineOfSight(level, run, monster.pos, pos) && distance < range,
    };
  };

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
    const silhouetteMat = new MeshBasicMaterial({
      color: 0x9fdfff,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const silhouette = new Mesh(remoteGeo, silhouetteMat);
    silhouette.position.set(x, y + 0.15, z);
    silhouette.visible = false;
    silhouette.renderOrder = 5;
    scene.add(silhouette);

    const unit = factory?.createInstance() ?? null;
    if (unit) {
      unit.update({ x, y, z, yaw: 0, moving: false }, 0);
      scene.add(unit.root);
      return { root: unit.root, unit, capsule: null, capsuleMat: null, silhouette, silhouetteMat, lastX: x, lastZ: z, visibility: 0 };
    }

    const capsuleMat = remoteMat.clone();
    const capsule = new Mesh(remoteGeo, capsuleMat);
    capsule.castShadow = true;
    capsule.receiveShadow = true;
    capsule.position.set(x, y + 0.15, z);
    scene.add(capsule);
    return { root: capsule, unit: null, capsule, capsuleMat, silhouette, silhouetteMat, lastX: x, lastZ: z, visibility: 0 };
  };
  const removeRemoteVisual = (visual: RemotePlayerVisual): void => {
    visual.unit?.dispose();
    scene.remove(visual.root);
    scene.remove(visual.silhouette);
    visual.capsuleMat?.dispose();
    visual.silhouetteMat.dispose();
  };
  const applyRemoteVisibility = (visual: RemotePlayerVisual, x: number, y: number, z: number): number => {
    const local = playerPos();
    const remote = new Vector3(x, y, z);
    const distance = dist2d(local, remote);
    const toRemote = remote.clone().sub(local);
    toRemote.y = 0;
    if (toRemote.lengthSq() > 0.0001) toRemote.normalize();
    const litByBeam = run.flashlightOn
      && distance < 12
      && forwardFromYaw(controls.yaw).dot(toRemote) > 0.68
      && hasGridLineOfSight(level, run, local, remote);

    let visibility = 0;
    if (distance <= DARK_CREW_FULL_RANGE) visibility = 0.68;
    else if (distance <= DARK_CREW_OUTLINE_RANGE) visibility = 0.14 + (1 - (distance - DARK_CREW_FULL_RANGE) / (DARK_CREW_OUTLINE_RANGE - DARK_CREW_FULL_RANGE)) * 0.36;
    if (litByBeam) visibility = Math.max(visibility, 0.88);
    if (isSafeRoom(level, local)) visibility = Math.max(visibility, distance < 7 ? 0.58 : visibility);
    visibility = clamp(visibility, 0, 1);

    visual.visibility = visibility;
    visual.root.visible = visibility > 0.42;
    if (visual.capsuleMat) {
      visual.capsuleMat.opacity = clamp(visibility, 0.1, 0.9);
      visual.capsuleMat.emissiveIntensity = 0.1 + visibility * 0.95;
    }
    visual.silhouette.position.set(x, y + 0.15, z);
    visual.silhouette.visible = visibility > 0.05;
    visual.silhouette.scale.setScalar(0.9 + visibility * 0.2);
    visual.silhouetteMat.opacity = clamp(visibility * 0.45, 0, 0.38);
    return distance <= DARK_CREW_OUTLINE_RANGE ? 1 : 0;
  };
  const syncRemoteMarkers = (dt = 0): void => {
    if (!remoteWorld) {
      for (const visual of remoteVisuals.values()) removeRemoteVisual(visual);
      remoteVisuals.clear();
      run.nearbyCrew = 0;
      return;
    }

    const seen = new Set<number>();
    let nearbyCrew = 0;
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
      nearbyCrew += applyRemoteVisibility(visual, x, y, z);
    }
    run.nearbyCrew = nearbyCrew;
    if (nearbyCrew > 0 && !run.flashlightOn && !storyFlags.heardDarkCrewHint) {
      storyFlags.heardDarkCrewHint = true;
      radioSay('VESTA: Suit outline active. Stay close. Keep lights down.');
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

  const nearestVisiblePickup = (pos: Vector3): ShipPickup | null => {
    let best: ShipPickup | null = null;
    let bestD = Infinity;
    for (const { pickup, mesh } of pickupMeshes) {
      if (collectedPickups.has(pickup.id) || !mesh.visible) continue;
      const d = dist2d(pos, { x: pickup.pos[0], z: pickup.pos[2] });
      if (d < pickup.radius + 0.9 && d < bestD) {
        best = pickup;
        bestD = d;
      }
    }
    return best;
  };

  const promptFor = (pos: Vector3): string | null => {
    if (run.stage === 'won' || run.stage === 'dead') return null;

    const station = nearestStation(pos);
    if (station?.kind === 'power') {
      return run.stage === 'restorePower' ? 'E - restore engineering power' : 'Engineering power online';
    }
    if (station?.kind === 'comms') {
      if (run.stage === 'installFuse') return 'E - install comms fuse';
      if (run.stage === 'holdout') return `Transmitter charging ${Math.round(commsCharge(run) * 100)}%`;
      if (run.stage === 'extract') return 'Transmitter online';
      return 'Comms relay needs the fuse';
    }
    if (station?.kind === 'extract') {
      return run.stage === 'extract' ? 'E - cycle airlock and extract' : 'Airlock clamp sealed';
    }

    const door = blockedDoorsNear(pos);
    if (door) {
      const reason = door.unlock === 'power' ? 'restore power' : door.unlock === 'fuse' ? 'find fuse' : 'survive attack';
      return `${door.label} locked - ${reason}`;
    }

    const pickup = nearestVisiblePickup(pos);
    if (pickup) return `${pickup.label} +${pickup.amount}`;
    if (isSafeRoom(level, pos)) return 'Safe room - monster will not enter';
    return null;
  };

  const updatePrompt = (pos: Vector3): void => {
    if (!promptEl) return;
    const prompt = promptFor(pos);
    promptEl.textContent = prompt ?? '';
    promptEl.style.opacity = prompt ? '1' : '0';
  };

  const updateEndScreen = (): void => {
    if (!endScreenEl || !endTitleEl || !endDetailEl) return;
    if (run.stage !== 'won' && run.stage !== 'dead') {
      endScreenEl.classList.remove('visible');
      lastEndStage = null;
      return;
    }
    if (lastEndStage === run.stage) return;
    lastEndStage = run.stage;
    const won = run.stage === 'won';
    endTitleEl.textContent = won ? 'Signal Restored' : 'Crew Lost';
    endDetailEl.textContent = won
      ? 'The transmitter is live. You made it back to the airlock.'
      : 'The ship goes quiet again. Restart the run and use the med bay as a safe room.';
    endScreenEl.classList.add('visible');
    playCue(won ? 'win' : 'dead');
  };

  const showStunBeam = (from: Vector3, to: Vector3): void => {
    const delta = to.clone().sub(from);
    const length = delta.length();
    if (length <= 0.01) return;
    stunBeam.position.copy(from).addScaledVector(delta, 0.5);
    stunBeam.scale.set(1, 1, length);
    stunBeam.lookAt(to);
    stunBeam.visible = true;
    stunBeamTimer = 0.14;
    stunLight.position.copy(from);
    stunLight.intensity = 160;
  };

  const startFirstEncounter = (): void => {
    if (run.encounterPhase !== 'idle') return;
    run.encounterPhase = 'telegraph';
    run.encounterTimer = 2.15;
    run.tension = Math.max(run.tension, 44);
    encounterFlash = 0.9;
    monster.pos.copy(FIRST_ENCOUNTER_START);
    monster.path = [];
    monster.repathIn = 0;
    monster.attackWindup = 0;
    monster.mode = 'investigate';
    flashStatus('vent rattle ahead', 2.2);
    playCue('scare');
  };

  const updateFirstEncounter = (dt: number, pos: Vector3): boolean => {
    if (!encounterActive(run)) return false;
    run.encounterTimer = Math.max(0, run.encounterTimer - dt);
    monster.path = [];
    monster.attackWindup = 0;
    monster.mode = 'investigate';

    if (run.encounterPhase === 'telegraph') {
      monster.pos.copy(FIRST_ENCOUNTER_START);
      monster.yaw = -Math.PI / 2;
      if (run.encounterTimer <= 0) {
        run.encounterPhase = 'cross';
        run.encounterTimer = 1.25;
        encounterFlash = 1;
        flashStatus('something crossed the bulkhead', 1.8);
        playCue('monster');
      }
      return true;
    }

    if (run.encounterPhase === 'cross') {
      const progress = 1 - run.encounterTimer / 1.25;
      monster.pos.copy(FIRST_ENCOUNTER_START).lerp(FIRST_ENCOUNTER_END, clamp(progress, 0, 1));
      monster.yaw = Math.PI / 2;
      if (run.encounterTimer <= 0) {
        run.encounterPhase = 'recover';
        run.encounterTimer = 1.05;
        monster.investigateTarget = pos.clone();
      }
      return true;
    }

    monster.pos.copy(FIRST_ENCOUNTER_END);
    monster.yaw = Math.PI / 2;
    if (run.encounterTimer <= 0) {
      run.encounterPhase = 'done';
      run.encounterTimer = 0;
      monster.mode = 'investigate';
      monster.investigateTarget = pos.clone();
      monster.repathIn = 0;
      flashStatus('find the comms fuse', 2.4);
    }
    return true;
  };

  const updateTension = (dt: number, pos: Vector3): void => {
    const monsterDistance = dist2d(monster.pos, pos);
    let target = 10;
    if (isSafeRoom(level, pos)) target = 4;
    if (run.stage === 'holdout') target = Math.max(target, 56 + commsCharge(run) * 22);
    if (encounterActive(run)) target = Math.max(target, 72);
    if (monster.mode === 'investigate') target = Math.max(target, 34);
    if (monster.mode === 'chase') target = Math.max(target, 78);
    if (monster.mode === 'attack') target = Math.max(target, 96);
    if (monsterDistance < 8 && !isSafeRoom(level, pos)) target = Math.max(target, 70 + (8 - monsterDistance) * 4);
    if (run.stage === 'dead') target = 100;
    if (run.stage === 'won') target = 0;

    const rate = target > run.tension ? 54 : isSafeRoom(level, pos) ? 32 : 14;
    run.tension += clamp(target - run.tension, -rate * dt, rate * dt);
    run.tension = clamp(run.tension, 0, 100);

    if (run.tension > 42 && run.stage !== 'won' && run.stage !== 'dead' && run.simTime >= nextTensionPulseAt) {
      playCue('tension');
      nextTensionPulseAt = run.simTime + clamp(1.2 - run.tension / 135, 0.38, 1.05);
    }
  };

  const triggerScarePeak = (pos: Vector3): void => {
    const hotSound = run.soundPressure > 0.5;
    const hotLight = run.lightExposure > 0.42 || flashlightBeamHitsMonster(pos);
    const roll = rng();
    const kind = hotLight && roll < 0.44 ? 'blackout' : hotSound && roll < 0.78 ? 'mimic' : 'scrape';
    run.scarePhase = 'peak';
    run.scareTimer = kind === 'blackout' ? 0.85 : 0.56;
    run.lastScareAt = run.simTime;
    run.scareDebt = clamp(run.scareDebt + 0.28, 0, 1);
    run.nextScareAt = run.simTime + 10 + rng() * 8 + run.scareDebt * 7;
    encounterFlash = Math.max(encounterFlash, kind === 'blackout' ? 0.95 : 0.62);

    if (kind === 'blackout') {
      blackoutTimer = 1.65;
      flashStatus('panel blackout - light is bait', 1.5);
      playCue('blackout');
    } else if (kind === 'mimic') {
      flashStatus('a voice answered from the vent', 1.8);
      playCue('scare');
      if (!storyFlags.heardFirstMimic) {
        storyFlags.heardFirstMimic = true;
        radioSay('UNKNOWN: I can sound like your friend now.');
      }
    } else {
      flashStatus('wet scrape behind you', 1.3);
      playCue('monster');
    }
  };

  const updateScareDirector = (dt: number, pos: Vector3, playerNoise: number): void => {
    if (run.stage === 'won' || run.stage === 'dead') return;
    run.scareDebt = clamp(run.scareDebt - dt * 0.035, 0, 1);

    if (run.scarePhase === 'build') {
      run.scareTimer -= dt;
      if (run.scareTimer <= 0) triggerScarePeak(pos);
      return;
    }
    if (run.scarePhase === 'peak') {
      run.scareTimer -= dt;
      if (run.scareTimer <= 0) {
        run.scarePhase = 'relax';
        run.scareTimer = 2.4;
      }
      return;
    }
    if (run.scarePhase === 'relax') {
      run.scareTimer -= dt;
      if (run.scareTimer <= 0) run.scarePhase = 'lull';
      return;
    }

    if (!run.powered || encounterActive(run) || isSafeRoom(level, pos) || run.simTime < run.nextScareAt) return;
    const threat = run.tension / 100 + run.lightExposure * 0.36 + run.soundPressure * 0.32 + (playerNoise > 0.55 ? 0.18 : 0);
    if (threat < 0.48) return;

    run.scarePhase = 'build';
    run.scareTimer = 0.72 + rng() * 0.45;
    run.nextScareAt = run.simTime + 7;
    flashStatus(run.soundPressure > 0.5 ? 'the chorus is listening' : 'something shifts ahead', 1.0);
    playCue('step');
  };

  const updateRunMeters = (): void => {
    if (tensionFillEl) tensionFillEl.style.width = `${Math.round(run.tension)}%`;
    const charge = commsCharge(run);
    if (commsFillEl) commsFillEl.style.width = `${Math.round(charge * 100)}%`;
    if (commsMeterEl) commsMeterEl.style.opacity = run.stage === 'holdout' || charge > 0 ? '1' : '0.35';
  };

  const addPickup = (pickup: ShipPickup): void => {
    playCue('pickup');
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
        playCue('door');
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
      startFirstEncounter();
      radioSay('VESTA: Auxiliary power is live. The ship can hear us again.');
      playCue('power');
      return 0.7;
    }
    if (station.kind === 'comms' && run.stage === 'installFuse') {
      run.stage = 'holdout';
      run.holdoutSeconds = HOLDOUT_SECONDS;
      monster.mode = 'chase';
      monster.repathIn = 0;
      flashStatus('transmitter charging - survive', 3);
      if (!storyFlags.heardCommsTrapHint) {
        storyFlags.heardCommsTrapHint = true;
        radioSay('VESTA: Your signal is live. Something else is answering.');
      }
      playCue('comms');
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
      playCue('door');
      return 0.2;
    }
    run.ammoMag -= 1;
    playCue('stun');
    const toMonster = monster.pos.clone().sub(pos);
    const range = Math.hypot(toMonster.x, toMonster.z);
    const forward = forwardFromYaw(controls.yaw);
    toMonster.y = 0;
    if (range > 0.001) toMonster.normalize();
    const hit = range < 8.5 && forward.dot(toMonster) > 0.68 && hasGridLineOfSight(level, run, pos, monster.pos);
    const beamStart = pos.clone().setY(pos.y + EYE_OFFSET);
    const beamEnd = monster.pos.clone().setY(monster.pos.y + 0.85);
    showStunBeam(beamStart, hit ? beamEnd : beamStart.clone().addScaledVector(forward, 7.5));
    if (hit) {
      monster.mode = 'stunned';
      monster.stunTimer = 3.2;
      monster.path = [];
      monster.repathIn = 0;
      monsterHitFlash = 0.28;
      flashStatus('monster stunned', 2.2);
    } else {
      flashStatus('stun pulse missed', 1.2);
      monster.mode = 'investigate';
      monster.investigateTarget = pos.clone();
    }
    return 1.2;
  };

  const moveMonster = (dt: number, target: Vector3, speed: number): number => {
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
    if (len < 0.05) return 0;
    const step = Math.min(speed * dt, len);
    monster.pos.x += (dx / len) * step;
    monster.pos.z += (dz / len) * step;
    monster.yaw = Math.atan2(-dx / len, -dz / len);
    return step;
  };

  const trackMonsterStep = (moved: number, playerDistance: number): void => {
    if (moved <= 0.001) return;
    monster.footstepMeters += moved;
    const threshold = monster.mode === 'chase' || monster.mode === 'attack' ? 1.35 : 2.2;
    if (monster.footstepMeters < threshold) return;
    monster.footstepMeters = 0;
    if (playerDistance < 18) playCue('step');
  };

  const damagePlayer = (amount: number): void => {
    run.health = clamp(run.health - amount, 0, 100);
    run.resolve = clamp(run.resolve - amount * 0.75, 0, 100);
    damageFlash = 1;
    playCue('hit');
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

    const previousMode = monster.mode;
    monster.attackCooldown = Math.max(0, monster.attackCooldown - dt);
    if (updateFirstEncounter(dt, pos)) return;
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
    const visibility = playerVisibilityToMonster(pos, distance);
    const heardPlayer = playerNoise > 0 && distance < 7 + (playerNoise + run.soundPressure * 0.5) * 15;
    const lightAttracted = run.lightExposure > 0.18
      && distance < 18.5
      && run.simTime - lastLightAttractionAt > 0.7
      && hasGridLineOfSight(level, run, monster.pos, pos);
    const playerSafe = isSafeRoom(level, pos);
    if (visibility.beamHit) run.lightExposure = clamp(run.lightExposure + dt * 0.5, 0, 1);

    if (playerSafe) {
      monster.mode = 'investigate';
      monster.attackWindup = 0;
      monster.investigateTarget = SAFE_ROOM_GUARD;
      trackMonsterStep(moveMonster(dt, SAFE_ROOM_GUARD, 1.65), distance);
      return;
    }

    if (run.stage === 'holdout') {
      monster.mode = distance < 1.35 ? 'attack' : 'chase';
      monster.investigateTarget = pos.clone();
    } else if (visibility.canSee) {
      monster.mode = distance < 1.35 ? 'attack' : 'chase';
      monster.lostSightSeconds = 0;
    } else if (lightAttracted) {
      monster.mode = 'investigate';
      monster.investigateTarget = pos.clone();
      monster.repathIn = 0;
      lastLightAttractionAt = run.simTime;
      flashStatus('the chorus saw the beam', 1.4);
      if (!storyFlags.heardLightWarning) {
        storyFlags.heardLightWarning = true;
        radioSay('VESTA: Your flashlight paints a runway. Use it in bursts.');
      }
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
      if (run.soundPressure > 0.5 && !storyFlags.heardSoundWarning) {
        storyFlags.heardSoundWarning = true;
        radioSay('VESTA: Talk to survive. Whisper to hide. Scream and it comes hungry.');
      }
    }

    if ((monster.mode === 'chase' || monster.mode === 'attack') && previousMode !== 'chase' && previousMode !== 'attack') {
      playCue('monster');
    }

    if (monster.mode === 'attack') {
      if (distance > 1.55) {
        monster.mode = 'chase';
        monster.attackWindup = 0;
      } else if (monster.attackCooldown <= 0) {
        if (monster.attackWindup <= 0) {
          monster.attackWindup = 0.46;
          flashStatus('attack incoming', 0.55);
          playCue('monster');
        } else {
          monster.attackWindup -= dt;
          if (monster.attackWindup <= 0 && distance <= 1.65) {
            monsterLungeTimer = 0.24;
            damagePlayer(run.stage === 'holdout' ? 22 : 16);
            monster.attackCooldown = 1.35;
          }
        }
      }
      trackMonsterStep(moveMonster(dt, pos, monster.attackWindup > 0 ? 0.55 : 1.2), distance);
      return;
    }

    if (monster.mode === 'chase') {
      monster.attackWindup = 0;
      trackMonsterStep(moveMonster(dt, pos, run.stage === 'holdout' ? 3.05 : 2.45), distance);
      return;
    }

    if (monster.mode === 'investigate' && monster.investigateTarget) {
      trackMonsterStep(moveMonster(dt, monster.investigateTarget, 1.75), distance);
      if (dist2d(monster.pos, monster.investigateTarget) < 0.7) {
        monster.mode = 'patrol';
        monster.investigateTarget = null;
      }
      return;
    }

    const patrol = level.patrolNodes[monster.patrolIndex % level.patrolNodes.length];
    if (!patrol) return;
    const target = new Vector3(patrol.pos[0], patrol.pos[1], patrol.pos[2]);
    trackMonsterStep(moveMonster(dt, target, 1.1), distance);
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
  const syncHudState = (): void => {
    updatePrompt(playerPos());
    updateEndScreen();
    updateRunMeters();
    updateRadioLine();
    hudSync({
      health: Math.round(run.health),
      battery: Math.round(run.battery),
      resolve: Math.round(run.resolve),
      ammoMag: Math.round(run.ammoMag),
      ammoReserve: Math.round(run.ammoReserve),
      objective: objectiveText(run, activeFuse),
      status: statusText(run, monster, game.playerController.isGrounded),
    });
  };
  const runStateView = (): WalkRunStateView => ({
    stage: run.stage,
    health: run.health,
    battery: run.battery,
    resolve: run.resolve,
    ammoMag: run.ammoMag,
    ammoReserve: run.ammoReserve,
    hasFuse: run.hasFuse,
    powered: run.powered,
    flashlightOn: run.flashlightOn,
    holdoutSeconds: run.holdoutSeconds,
    simTime: run.simTime,
    status: statusText(run, monster, game.playerController.isGrounded),
    inSafeRoom: isSafeRoom(level, playerPos()),
    tension: run.tension,
    commsCharge: commsCharge(run),
    lightExposure: run.lightExposure,
    soundPressure: run.soundPressure,
    voiceLevel: run.voiceLevel,
    activeVoice: run.activeVoice,
    voiceSource: run.voiceSource,
    micVoiceStatus: micVoice.status,
    scarePhase: run.scarePhase,
    scareDebt: run.scareDebt,
    inSlickZone: run.inSlickZone,
    nearbyCrew: run.nearbyCrew,
    encounterPhase: run.encounterPhase,
    encounterTimer: run.encounterTimer,
    activeFuse: {
      id: activeFuse.id,
      pos: { x: activeFuse.pos[0], y: activeFuse.pos[1], z: activeFuse.pos[2] },
    },
    collectedPickupIds: [...collectedPickups],
    doors: level.doors.map((door) => ({
      id: door.id,
      unlock: door.unlock,
      unlocked: isDoorUnlocked(door, run),
    })),
    stations: level.stations.map((station) => ({
      id: station.id,
      kind: station.kind,
      pos: { x: station.pos[0], y: station.pos[1], z: station.pos[2] },
    })),
    pickups: level.pickups.map((pickup) => ({
      id: pickup.id,
      kind: pickup.kind,
      active: pickup.variantGroup !== 'fuse' || pickup.id === activeFuse.id,
      collected: collectedPickups.has(pickup.id),
      pos: { x: pickup.pos[0], y: pickup.pos[1], z: pickup.pos[2] },
    })),
  });
  const monsterStateView = (): MonsterStateView => ({
    mode: monster.mode,
    x: monster.pos.x,
    y: monster.pos.y,
    z: monster.pos.z,
    attackCooldown: monster.attackCooldown,
    attackWindup: monster.attackWindup,
    stunTimer: monster.stunTimer,
  });
  const uiFeedbackView = (): WalkUiFeedbackView => ({
    promptText: promptEl?.textContent ?? '',
    promptVisible: promptEl?.style.opacity === '1',
    damageFlash,
    damageFlashOpacity: Number(damageFlashEl?.style.opacity || 0),
    endVisible: endScreenEl?.classList.contains('visible') ?? false,
    endTitle: endTitleEl?.textContent ?? '',
    endDetail: endDetailEl?.textContent ?? '',
    stunBeamVisible: stunBeam.visible,
    monsterHitFlash,
    radioText: radioLineEl?.textContent ?? '',
    radioVisible: radioLineEl?.style.opacity === '1',
    lightExposure: run.lightExposure,
    soundPressure: run.soundPressure,
    scarePhase: run.scarePhase,
    activeVoice: run.activeVoice,
    voiceSource: run.voiceSource,
    micVoiceStatus: micVoice.status,
    inSlickZone: run.inSlickZone,
    nearestRemoteVisibility: Math.max(0, ...[...remoteVisuals.values()].map((visual) => visual.visibility)),
    remoteVisibleCount: [...remoteVisuals.values()].filter((visual) => visual.visibility > 0.05).length,
  });
  const setPlayerPoseForSmoke = (pose: SmokePose): void => {
    game.setControlledPlayerPose(playerEid, {
      x: pose.x,
      y: pose.y ?? Transform.y[playerEid] ?? 1,
      z: pose.z,
      yaw: pose.yaw ?? controls.yaw,
    });
    lastLocalX = pose.x;
    lastLocalZ = pose.z;
    placeCamera();
    syncHudState();
  };
  const setMonsterPoseForSmoke = (pose: SmokePose): void => {
    monster.pos.set(pose.x, pose.y ?? monster.pos.y, pose.z);
    monster.path = [];
    monster.repathIn = 0;
    monster.attackWindup = 0;
    monster.attackCooldown = 0;
    monster.stunTimer = 0;
    monster.mode = 'patrol';
    if (pose.yaw !== undefined) monster.yaw = pose.yaw;
  };
  const setRemotePoseForSmoke = (pose: SmokeRemotePose): void => {
    const netId = pose.netId ?? SMOKE_REMOTE_NET_ID;
    const player = game.addNetworkPlayer(netId, { x: pose.x, y: pose.y ?? 1, z: pose.z }, 1);
    game.setControlledPlayerPose(player.eid, {
      x: pose.x,
      y: pose.y ?? Transform.y[player.eid] ?? 1,
      z: pose.z,
      yaw: pose.yaw ?? yawFromTransform(player.eid),
    });
    remoteWorld = game.world;
    syncRemoteMarkers();
    syncHudState();
  };
  const setFlashlightForSmoke = (on: boolean): void => {
    setFlashlightOn(on, false);
    syncRunToEcs();
    syncHudState();
  };
  const voiceForSmoke = (command: VoiceCommand): number => {
    const noise = applyVoiceSignal(voiceSignalFromCommand(command, 'smoke'), playerPos());
    run.soundPressure = clamp(run.soundPressure + noise * 0.58, 0, 1);
    run.voiceLevel = run.activeVoice ?? voiceLevelFromNoise(noise, run.soundPressure);
    syncRunToEcs();
    syncHudState();
    return noise;
  };
  const voicePressureForSmoke = (pressure: number): number => {
    const signal = voiceSignalFromPressure(pressure, 'smoke');
    const noise = applyVoiceSignal(signal, playerPos());
    run.soundPressure = clamp(run.soundPressure + noise * 0.58, 0, 1);
    run.voiceLevel = run.activeVoice ?? voiceLevelFromNoise(noise, run.soundPressure);
    syncRunToEcs();
    syncHudState();
    return noise;
  };
  const interactForSmoke = (): number => {
    const noise = handleInteract(playerPos());
    syncRunToEcs();
    syncHudState();
    return noise;
  };
  const fireForSmoke = (): number => {
    const noise = handleFire(playerPos());
    syncRunToEcs();
    syncHudState();
    return noise;
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
    runState: runStateView,
    monsterState: monsterStateView,
    uiFeedback: uiFeedbackView,
    setPlayerPoseForSmoke,
    setMonsterPoseForSmoke,
    setRemotePoseForSmoke,
    setFlashlightForSmoke,
    voiceForSmoke,
    voicePressureForSmoke,
    interactForSmoke,
    fireForSmoke,
    fixedStep(dt) {
      run.simTime += dt;
      let playerNoise = 0;
      const before = playerPos();
      const active = run.stage !== 'dead' && run.stage !== 'won';
      run.voiceTimer = Math.max(0, run.voiceTimer - dt);
      if (run.voiceTimer <= 0) {
        run.activeVoice = null;
        run.voiceSource = null;
      }

      if (controls.consumeFlashlightToggle()) {
        setFlashlightOn(!run.flashlightOn);
        playerNoise += 0.2;
      }

      const mv = active ? controls.moveVector() : { x: 0, z: 0 };
      const movingInput = Math.hypot(mv.x, mv.z) > 0.01;
      const slick = slicknessAt(before);
      run.inSlickZone = slick.amount > 0.16;
      if (run.inSlickZone) {
        const steerRate = controls.sprinting ? 1.9 : 1.15;
        slickMoveX += (mv.x - slickMoveX) * Math.min(1, dt * steerRate);
        slickMoveZ += (mv.z - slickMoveZ) * Math.min(1, dt * steerRate);
        if (!movingInput) {
          slickMoveX *= Math.max(0, 1 - dt * 0.72);
          slickMoveZ *= Math.max(0, 1 - dt * 0.72);
        }
        if (slick.label && run.simTime - lastSlickStatusAt > 8) {
          lastSlickStatusAt = run.simTime;
          flashStatus(`${slick.label} - physics wins`, 2.0);
        }
      } else {
        slickMoveX *= Math.max(0, 1 - dt * 5);
        slickMoveZ *= Math.max(0, 1 - dt * 5);
      }

      const slideMix = run.inSlickZone ? slick.amount * (controls.sprinting ? 0.52 : 0.34) : 0;
      const moveX = mv.x * (1 - slideMix * 0.45) + slickMoveX * slideMix;
      const moveZ = mv.z * (1 - slideMix * 0.45) + slickMoveZ * slideMix;
      const speedMultiplier = (controls.crouching ? 0.55 : controls.sprinting ? 1.45 : 1) * (run.inSlickZone && !controls.crouching ? 0.93 : 1);
      game.setInput({
        moveX,
        moveZ,
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
        if (run.simTime - lastDoorCueAt > 0.45) {
          lastDoorCueAt = run.simTime;
          playCue('door');
        }
        break;
      }

      localMoving = Math.hypot(Transform.x[playerEid]! - lastLocalX, Transform.z[playerEid]! - lastLocalZ) > 0.001;
      lastLocalX = Transform.x[playerEid]!;
      lastLocalZ = Transform.z[playerEid]!;

      if (localMoving) playerNoise += controls.crouching ? 0.1 : controls.sprinting ? 0.75 : 0.32;
      if (run.inSlickZone && (localMoving || movingInput)) playerNoise += slick.amount * (controls.sprinting ? 0.34 : 0.15);
      if (run.flashlightOn) {
        run.lightExposure = clamp(run.lightExposure + dt * LIGHT_EXPOSURE_GAIN, 0, 1);
        run.darkSeconds = 0;
        run.battery = clamp(run.battery - dt * (controls.sprinting ? 2.9 : 1.8), 0, 100);
        if (run.battery <= 0) {
          setFlashlightOn(false);
          flashStatus('battery empty', 2);
          playCue('door');
        }
      } else {
        run.lightExposure = clamp(run.lightExposure - dt * LIGHT_EXPOSURE_DECAY, 0, 1);
        run.darkSeconds += dt;
      }

      const monsterDistance = dist2d(monster.pos, pos);
      const safeRoom = isSafeRoom(level, pos);
      run.resolve = clamp(
        run.resolve
          + (safeRoom ? 4.2 : run.flashlightOn ? 0.55 : run.nearbyCrew > 0 ? 0.22 : -0.4) * dt
          + (run.nearbyCrew > 0 && !run.flashlightOn ? 0.58 * dt : 0)
          - (monsterDistance < 8 ? (8 - monsterDistance) * 0.7 * dt : 0)
          - (monster.mode === 'chase' || monster.mode === 'attack' ? 2.2 * dt : 0),
        0,
        100,
      );

      collectPickups(pos);
      if (active && controls.consumeInteract()) playerNoise += handleInteract(pos);
      if (active && controls.consumeFire()) playerNoise += handleFire(pos);
      const micSignal = active ? micVoice.update() : voiceSignalFromPressure(0, 'mic');
      if (micSignal.level !== 'silent') playerNoise += applyVoiceSignal(micSignal, pos, dt);
      const voice = active ? controls.consumeVoiceCommand() : null;
      if (voice) playerNoise += applyVoiceSignal(voiceSignalFromCommand(voice, 'keyboard'), pos);
      run.soundPressure = clamp(run.soundPressure + playerNoise * 0.58 - dt * 0.42, 0, 1);
      run.voiceLevel = run.activeVoice ?? voiceLevelFromNoise(playerNoise, run.soundPressure);
      if (run.voiceLevel === 'scream' && !storyFlags.heardSoundWarning) {
        storyFlags.heardSoundWarning = true;
        radioSay('VESTA: Talk to survive. Whisper to hide. Scream and it comes hungry.');
      }

      if (run.stage === 'holdout') {
        run.holdoutSeconds = Math.max(0, run.holdoutSeconds - dt);
        if (run.holdoutSeconds <= 0) {
          run.stage = 'extract';
          flashStatus('transmitter online - return to airlock', 4);
          playCue('power');
        }
      }

      updateMonster(dt, pos, playerNoise);
      updateTension(dt, pos);
      updateScareDirector(dt, pos, playerNoise);
      syncRunToEcs();
      syncHudState();
    },
    frameUpdate(dt) {
      corridor.update(dt);
      const t = run.simTime;
      damageFlash = Math.max(0, damageFlash - dt * 2.8);
      if (damageFlashEl) damageFlashEl.style.opacity = String(damageFlash * 0.82);
      encounterFlash = Math.max(0, encounterFlash - dt * 1.65);
      if (encounterFlashEl) encounterFlashEl.style.opacity = String(encounterFlash * (0.35 + run.tension / 180));
      blackoutTimer = Math.max(0, blackoutTimer - dt);
      stunBeamTimer = Math.max(0, stunBeamTimer - dt);
      stunBeam.visible = stunBeamTimer > 0;
      stunBeamMat.opacity = Math.min(0.78, stunBeamTimer * 5.8);
      stunLight.intensity = Math.max(0, stunLight.intensity - dt * 900);
      monsterHitFlash = Math.max(0, monsterHitFlash - dt);
      monsterLungeTimer = Math.max(0, monsterLungeTimer - dt);
      const charge = commsCharge(run);
      const blackoutDim = blackoutTimer > 0 ? 0.22 : 1;
      stationMat.emissiveIntensity = (0.85 + charge * 1.8 + (run.stage === 'holdout' ? Math.max(0, Math.sin(t * (7 + charge * 9))) * 0.65 : 0)) * blackoutDim;
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
      const windupPulse = monster.attackWindup > 0 ? 1.1 + Math.sin(t * 28) * 0.045 : 1;
      const lungePulse = monsterLungeTimer > 0 ? 1.18 + monsterLungeTimer * 0.7 : 1;
      const monsterScale = monster.mode === 'stunned'
        ? 0.92 + Math.sin(t * 38) * 0.025
        : monster.mode === 'chase'
          ? 1.04
          : windupPulse * lungePulse;
      if (monsterUnit) {
        monsterUnit.update(
          {
            x: monster.pos.x,
            y: monster.pos.y,
            z: monster.pos.z,
            yaw: monster.yaw,
            moving: monster.mode === 'chase' || monster.mode === 'investigate' || monster.mode === 'patrol',
            attacking: monster.mode === 'attack' || monsterLungeTimer > 0,
            stunned: monster.mode === 'stunned',
            hitFlash: monsterHitFlash,
          },
          dt,
        );
      } else {
        monsterRoot.position.copy(monster.pos);
        monsterRoot.rotation.y = monster.yaw;
        monsterRoot.scale.setScalar(monsterScale);
      }
      monsterEyeMat.emissiveIntensity = monster.mode === 'attack'
        ? 3.3
        : monsterHitFlash > 0
          ? 4.2
          : monster.mode === 'chase'
            ? 2.8
            : 2.2;
      if (monsterHitFlash > 0) monsterMat.emissiveIntensity = 2.1 + Math.sin(t * 52) * 0.45;
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
      canvas.removeEventListener('pointerdown', requestMicVoice);
      window.removeEventListener('keydown', requestMicVoice);
      micVoice.dispose();
      controls.dispose();
      localUnit?.dispose();
      monsterUnit?.dispose();
      if (localUnit) scene.remove(localUnit.root);
      if (localUnitFill) scene.remove(localUnitFill);
      if (monsterUnit) scene.remove(monsterUnit.root);
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
      if (!monsterUnit) scene.remove(monsterRoot);
      scene.remove(stunBeam);
      scene.remove(stunLight);
      monsterBody.geometry.dispose();
      stunBeam.geometry.dispose();
      stunBeamMat.dispose();
      doorMat.dispose();
      stationMat.dispose();
      pickupMat.dispose();
      fuseMat.dispose();
      monsterMat.dispose();
      monsterEyeMat.dispose();
      remoteGeo.dispose();
      remoteMat.dispose();
      void audioContext?.close();
      game.dispose();
    },
  };
}
