import { BoxGeometry, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Scene } from 'three';
import { LOOK, applyLookdevAtmosphere, createDustField, createIndustrialMaterials } from './look';

/** Grid unit used by the greybox ship generator. */
export const SHIP_CELL_SIZE = 4;

/** Legacy straight-corridor dimensions kept for older lookdev comments/tests. */
export const CORRIDOR = { W: SHIP_CELL_SIZE, H: 3, L: 32 } as const;

const WALL_THICKNESS = 0.2;
const SHIP_HEIGHT = 3;

export type CorridorMaterialKey = 'floor' | 'wall' | 'crate';
export type ShipPickupKind = 'fuse' | 'battery' | 'medkit' | 'stunAmmo';
export type ShipStationKind = 'power' | 'comms' | 'extract';
export type ShipDoorUnlock = 'power' | 'fuse' | 'survived';

/** A static box - a centre + half-extents - from which a Rapier collider is built in the walk scene. */
export interface CorridorBox {
  readonly pos: readonly [number, number, number];
  readonly half: readonly [number, number, number];
  readonly material: CorridorMaterialKey;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

export interface ShipCell {
  readonly ix: number;
  readonly iz: number;
  readonly zone: string;
}

export interface ShipStation {
  readonly id: string;
  readonly kind: ShipStationKind;
  readonly label: string;
  readonly pos: readonly [number, number, number];
  readonly radius: number;
}

export interface ShipPickup {
  readonly id: string;
  readonly kind: ShipPickupKind;
  readonly label: string;
  readonly pos: readonly [number, number, number];
  readonly radius: number;
  readonly amount: number;
  readonly variantGroup?: 'fuse';
}

export interface ShipDoor {
  readonly id: string;
  readonly label: string;
  readonly unlock: ShipDoorUnlock;
  readonly pos: readonly [number, number, number];
  readonly half: readonly [number, number, number];
}

export interface ShipPatrolNode {
  readonly id: string;
  readonly pos: readonly [number, number, number];
}

export interface CorridorBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface CorridorLevel {
  readonly id: 'ship1-greybox';
  readonly playerSpawn: { readonly x: number; readonly y: number; readonly z: number };
  readonly boxes: readonly CorridorBox[];
  readonly cells: readonly ShipCell[];
  readonly bounds: CorridorBounds;
  readonly stations: readonly ShipStation[];
  readonly pickups: readonly ShipPickup[];
  readonly doors: readonly ShipDoor[];
  readonly patrolNodes: readonly ShipPatrolNode[];
  readonly monsterSpawn: { readonly x: number; readonly y: number; readonly z: number };
}

export interface CorridorBuild {
  /** Solid surfaces (floor/ceiling/walls/crates); each backs a static collider. */
  readonly colliders: readonly CorridorBox[];
  readonly level: CorridorLevel;
  /** Per-frame material life for shared scene dressing (panel flicker, emergency glow). */
  update(dt: number): void;
}

function cellKey(ix: number, iz: number): string {
  return `${ix},${iz}`;
}

function cellCenter(ix: number, iz: number, y = 1): readonly [number, number, number] {
  return [ix * SHIP_CELL_SIZE, y, iz * SHIP_CELL_SIZE];
}

function createBounds(cells: readonly ShipCell[]): CorridorBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const cell of cells) {
    const x = cell.ix * SHIP_CELL_SIZE;
    const z = cell.iz * SHIP_CELL_SIZE;
    minX = Math.min(minX, x - SHIP_CELL_SIZE / 2);
    maxX = Math.max(maxX, x + SHIP_CELL_SIZE / 2);
    minZ = Math.min(minZ, z - SHIP_CELL_SIZE / 2);
    maxZ = Math.max(maxZ, z + SHIP_CELL_SIZE / 2);
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Reusable greybox ship descriptor: render boxes, matching static colliders, nav cells, stations,
 * pickups, soft doors, and enemy route data live together so lookdev and gameplay consume one map.
 */
export function createCorridorLevel(): CorridorLevel {
  const cells: ShipCell[] = [];
  const occupied = new Set<string>();
  const occupy = (ix: number, iz: number, zone: string): void => {
    const key = cellKey(ix, iz);
    if (occupied.has(key)) return;
    occupied.add(key);
    cells.push({ ix, iz, zone });
  };
  const occupyRect = (minIx: number, maxIx: number, minIz: number, maxIz: number, zone: string): void => {
    for (let ix = minIx; ix <= maxIx; ix++) {
      for (let iz = minIz; iz <= maxIz; iz++) occupy(ix, iz, zone);
    }
  };

  // Ship 1 greybox: docking bay -> central spine -> side rooms/maintenance loop -> engineering/comms.
  occupyRect(-1, 1, 3, 4, 'docking');
  occupyRect(0, 0, -8, 4, 'spine');
  occupyRect(-2, -1, 0, 1, 'storage');
  occupyRect(-2, -1, -2, -1, 'med');
  occupyRect(-2, -1, -7, -4, 'maintenance');
  occupyRect(-1, 0, -8, -8, 'maintenance-link');
  occupyRect(1, 3, -4, -2, 'engineering');
  occupyRect(1, 2, 1, 1, 'security');
  occupyRect(-1, 1, -10, -9, 'comms');

  const boxes: CorridorBox[] = [];
  const add = (
    size: readonly [number, number, number],
    pos: readonly [number, number, number],
    material: CorridorMaterialKey,
    castShadow: boolean,
    receiveShadow: boolean,
  ): void => {
    boxes.push({ pos, half: [size[0] / 2, size[1] / 2, size[2] / 2], material, castShadow, receiveShadow });
  };

  for (const cell of cells) {
    const x = cell.ix * SHIP_CELL_SIZE;
    const z = cell.iz * SHIP_CELL_SIZE;
    add([SHIP_CELL_SIZE, 0.2, SHIP_CELL_SIZE], [x, -0.1, z], 'floor', false, true);
    add([SHIP_CELL_SIZE, 0.2, SHIP_CELL_SIZE], [x, SHIP_HEIGHT, z], 'wall', true, true);

    if (!occupied.has(cellKey(cell.ix - 1, cell.iz))) {
      add([WALL_THICKNESS, SHIP_HEIGHT, SHIP_CELL_SIZE + WALL_THICKNESS], [x - SHIP_CELL_SIZE / 2, SHIP_HEIGHT / 2, z], 'wall', true, true);
    }
    if (!occupied.has(cellKey(cell.ix + 1, cell.iz))) {
      add([WALL_THICKNESS, SHIP_HEIGHT, SHIP_CELL_SIZE + WALL_THICKNESS], [x + SHIP_CELL_SIZE / 2, SHIP_HEIGHT / 2, z], 'wall', true, true);
    }
    if (!occupied.has(cellKey(cell.ix, cell.iz - 1))) {
      add([SHIP_CELL_SIZE + WALL_THICKNESS, SHIP_HEIGHT, WALL_THICKNESS], [x, SHIP_HEIGHT / 2, z - SHIP_CELL_SIZE / 2], 'wall', true, true);
    }
    if (!occupied.has(cellKey(cell.ix, cell.iz + 1))) {
      add([SHIP_CELL_SIZE + WALL_THICKNESS, SHIP_HEIGHT, WALL_THICKNESS], [x, SHIP_HEIGHT / 2, z + SHIP_CELL_SIZE / 2], 'wall', true, true);
    }
  }

  for (const [x, z, sx, sz] of [
    [-3.1, 13.6, 0.9, 1.1],
    [3.0, 15.5, 1.0, 0.85],
    [-5.8, 2.1, 1.15, 0.9],
    [-7.0, -5.2, 0.9, 1.2],
    [-6.6, -20.2, 1.0, 1.1],
    [5.6, -9.8, 1.2, 0.9],
    [9.6, -15.1, 1.25, 1.0],
    [2.2, -37.4, 0.9, 1.1],
  ] as const) {
    add([sx, 0.9, sz], [x, 0.45, z], 'crate', true, true);
  }

  return {
    id: 'ship1-greybox',
    playerSpawn: { x: 0, y: 1.0, z: 15.2 },
    boxes,
    cells,
    bounds: createBounds(cells),
    stations: [
      { id: 'engineering-power', kind: 'power', label: 'engineering breaker', pos: [10.4, 1.05, -12.2], radius: 1.75 },
      { id: 'comms-relay', kind: 'comms', label: 'comms relay', pos: [0, 1.05, -39.2], radius: 1.9 },
      { id: 'escape-hatch', kind: 'extract', label: 'airlock hatch', pos: [-2.8, 1.05, 16.5], radius: 1.9 },
    ],
    pickups: [
      { id: 'fuse-storage', kind: 'fuse', label: 'comms fuse', pos: [-4.55, 0.7, 0.65], radius: 1.15, amount: 1, variantGroup: 'fuse' },
      { id: 'fuse-med', kind: 'fuse', label: 'comms fuse', pos: [-4.65, 0.7, -8.85], radius: 1.15, amount: 1, variantGroup: 'fuse' },
      { id: 'fuse-maintenance', kind: 'fuse', label: 'comms fuse', pos: [-4.65, 0.7, -25.8], radius: 1.15, amount: 1, variantGroup: 'fuse' },
      { id: 'battery-dock', kind: 'battery', label: 'battery', pos: [3.1, 0.7, 12.5], radius: 1.1, amount: 35 },
      { id: 'battery-maint', kind: 'battery', label: 'battery', pos: [-6.4, 0.7, -17.2], radius: 1.1, amount: 35 },
      { id: 'med-storage', kind: 'medkit', label: 'med kit', pos: [-7.0, 0.7, 5.1], radius: 1.1, amount: 35 },
      { id: 'med-comms', kind: 'medkit', label: 'med kit', pos: [-3.2, 0.7, -37.5], radius: 1.1, amount: 30 },
      { id: 'ammo-security', kind: 'stunAmmo', label: 'stun cells', pos: [6.6, 0.7, 5.0], radius: 1.1, amount: 3 },
      { id: 'ammo-engineering', kind: 'stunAmmo', label: 'stun cells', pos: [11.1, 0.7, -17.0], radius: 1.1, amount: 2 },
    ],
    doors: [
      { id: 'engineering-door', label: 'engineering bulkhead', unlock: 'power', pos: [2.05, 1.32, -12], half: [0.15, 1.32, 1.55] },
      { id: 'maintenance-shortcut', label: 'maintenance shortcut', unlock: 'power', pos: [-2.05, 1.32, -16], half: [0.15, 1.32, 1.55] },
      { id: 'comms-door', label: 'comms pressure door', unlock: 'fuse', pos: [0, 1.32, -34.05], half: [1.55, 1.32, 0.15] },
      { id: 'escape-lock', label: 'airlock clamp', unlock: 'survived', pos: [-2.05, 1.32, 16], half: [0.15, 1.32, 1.55] },
    ],
    patrolNodes: [
      { id: 'dock', pos: cellCenter(0, 3) },
      { id: 'storage', pos: cellCenter(-1, 0) },
      { id: 'spine-mid', pos: cellCenter(0, -2) },
      { id: 'engineering', pos: cellCenter(2, -3) },
      { id: 'maintenance', pos: cellCenter(-1, -6) },
      { id: 'comms-door', pos: cellCenter(0, -8) },
      { id: 'comms', pos: cellCenter(0, -10) },
    ],
    monsterSpawn: { x: 8, y: 1, z: -17 },
  };
}

/**
 * Build the canonical greybox ship into a scene - the single source of geometry shared by the
 * look-only corridor and the playable slice. The generated map is intentionally boxy so it can later
 * be swapped for kit GLBs without changing gameplay data.
 */
export function buildCorridor(scene: Scene, level = createCorridorLevel()): CorridorBuild {
  applyLookdevAtmosphere(scene);

  const materials = createIndustrialMaterials();
  const colliderMaterials: Record<CorridorMaterialKey, typeof materials.wall> = {
    wall: materials.wall,
    floor: materials.floor,
    crate: materials.crate,
  };

  const unitBox = new BoxGeometry(1, 1, 1);
  const matrix = new Matrix4();
  for (const key of ['floor', 'wall', 'crate'] as const) {
    const boxes = level.boxes.filter((box) => box.material === key);
    const mesh = new InstancedMesh(unitBox, colliderMaterials[key], boxes.length);
    let i = 0;
    for (const box of boxes) {
      matrix.identity();
      matrix.makeScale(box.half[0] * 2, box.half[1] * 2, box.half[2] * 2);
      matrix.setPosition(box.pos[0], box.pos[1], box.pos[2]);
      mesh.setMatrixAt(i++, matrix);
    }
    mesh.castShadow = boxes.some((box) => box.castShadow);
    mesh.receiveShadow = boxes.some((box) => box.receiveShadow);
    scene.add(mesh);
  }

  const trimBox = new BoxGeometry(1, 1, 1);
  const ribMesh = new InstancedMesh(trimBox, materials.trim, level.cells.length * 3);
  let rib = 0;
  for (const cell of level.cells) {
    const x = cell.ix * SHIP_CELL_SIZE;
    const z = cell.iz * SHIP_CELL_SIZE;
    matrix.identity();
    matrix.makeScale(SHIP_CELL_SIZE - 0.45, 0.14, 0.2);
    matrix.setPosition(x, SHIP_HEIGHT - 0.22, z - SHIP_CELL_SIZE / 2 + 0.16);
    ribMesh.setMatrixAt(rib++, matrix);
    matrix.identity();
    matrix.makeScale(SHIP_CELL_SIZE - 0.45, 0.14, 0.2);
    matrix.setPosition(x, SHIP_HEIGHT - 0.22, z + SHIP_CELL_SIZE / 2 - 0.16);
    ribMesh.setMatrixAt(rib++, matrix);
    matrix.identity();
    matrix.makeScale(0.16, SHIP_HEIGHT - 0.2, 0.16);
    matrix.setPosition(x - SHIP_CELL_SIZE / 2 + 0.18, SHIP_HEIGHT / 2, z);
    ribMesh.setMatrixAt(rib++, matrix);
  }
  ribMesh.castShadow = true;
  ribMesh.receiveShadow = true;
  scene.add(ribMesh);

  const warningStrips = new InstancedMesh(new BoxGeometry(0.06, 0.055, 1.35), materials.hazard, level.cells.length * 2);
  let strip = 0;
  for (const cell of level.cells) {
    const x = cell.ix * SHIP_CELL_SIZE;
    const z = cell.iz * SHIP_CELL_SIZE;
    matrix.identity();
    matrix.makeTranslation(x - SHIP_CELL_SIZE / 2 + 0.22, 0.18, z);
    warningStrips.setMatrixAt(strip++, matrix);
    matrix.identity();
    matrix.makeTranslation(x + SHIP_CELL_SIZE / 2 - 0.22, 0.18, z);
    warningStrips.setMatrixAt(strip++, matrix);
  }
  warningStrips.receiveShadow = true;
  scene.add(warningStrips);

  const addPanel = (x: number, y: number, z: number, material: typeof materials.amberLight): void => {
    const panel = new Mesh(new BoxGeometry(0.055, 0.42, 0.82), material);
    panel.position.set(x, y, z);
    panel.castShadow = false;
    panel.receiveShadow = false;
    scene.add(panel);
  };
  addPanel(1.88, 1.42, 8.1, materials.amberLight);
  addPanel(-1.88, 1.3, -6.5, materials.cyanLight);
  addPanel(7.88, 1.52, -12.0, materials.amberLight);
  addPanel(-7.88, 1.78, -21.3, materials.cyanLight);
  addPanel(1.88, 1.52, -38.4, materials.amberLight);

  const leftBlood = new Mesh(new PlaneGeometry(0.92, 0.54), materials.bloodDecal);
  leftBlood.position.set(-1.895, 1.08, -25.35);
  leftBlood.rotation.y = Math.PI / 2;
  scene.add(leftBlood);

  const floorScorch = new Mesh(new PlaneGeometry(1.4, 0.78), materials.scorchDecal);
  floorScorch.position.set(8.66, 0.014, -13.25);
  floorScorch.rotation.x = -Math.PI / 2;
  scene.add(floorScorch);

  const dust = createDustField(
    level.bounds.maxX - level.bounds.minX,
    SHIP_HEIGHT * 0.85,
    level.bounds.maxZ - level.bounds.minZ,
    420,
  );
  dust.position.set((level.bounds.minX + level.bounds.maxX) / 2, 0, (level.bounds.minZ + level.bounds.maxZ) / 2);
  scene.add(dust);

  let t = 0;
  return {
    colliders: level.boxes,
    level,
    update(dt: number) {
      t += dt;
      const amberStutter = Math.sin(t * 23.0) > 0.86 ? 0.28 : 1;
      const cyanStutter = Math.sin(t * 17.0 + 1.2) > 0.9 ? 0.42 : 1;
      materials.amberLight.emissiveIntensity = (1.0 + Math.sin(t * 4.8) * 0.22) * amberStutter;
      materials.cyanLight.emissiveIntensity = (0.62 + Math.sin(t * 3.7 + 0.6) * 0.16) * cyanStutter;
      materials.hazard.emissive.setHex(LOOK.amber);
      materials.hazard.emissiveIntensity = 0.1 + Math.max(0, Math.sin(t * 2.1)) * 0.05;
    },
  };
}
