import {
  BoxGeometry,
  CanvasTexture,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  PlaneGeometry,
  PointLight,
  Scene,
  Sprite,
  SpriteMaterial,
} from 'three';
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
  const addSign = (label: string, x: number, y: number, z: number, color = '#7fd2ff'): void => {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'rgba(3, 8, 12, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fillStyle = color;
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
    const texture = new CanvasTexture(canvas);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sign = new Sprite(material);
    sign.position.set(x, y, z);
    sign.scale.set(1.16, 0.29, 1);
    scene.add(sign);
  };
  addPanel(1.88, 1.42, 8.1, materials.amberLight);
  addPanel(-1.88, 1.3, -6.5, materials.cyanLight);
  addPanel(7.88, 1.52, -12.0, materials.amberLight);
  addPanel(-7.88, 1.78, -21.3, materials.cyanLight);
  addPanel(1.88, 1.52, -38.4, materials.amberLight);
  addSign('AIRLOCK', -1.1, 2.05, 13.65, '#9fd0ff');
  addSign('STORAGE', -5.9, 2.0, 1.3, '#e8a33d');
  addSign('MED BAY', -6.0, 2.0, -6.2, '#6eff9c');
  addSign('ENGINEERING', 8.2, 2.1, -10.6, '#ffbe4d');
  addSign('COMMS', 0.0, 2.18, -34.9, '#7fd2ff');

  const addProp = (
    size: readonly [number, number, number],
    pos: readonly [number, number, number],
    material: typeof materials.wall,
  ): Mesh => {
    const prop = new Mesh(new BoxGeometry(size[0], size[1], size[2]), material);
    prop.position.set(pos[0], pos[1], pos[2]);
    prop.castShadow = true;
    prop.receiveShadow = true;
    scene.add(prop);
    return prop;
  };

  // Comms objective vignette: a clear pressure-door focal point with a fuse socket, relay hardware,
  // cable clutter, and a fallen silhouette so the far end of the route reads as authored content.
  const commsDoorZ = -34.05;
  addProp([3.7, 0.24, 0.34], [0, 2.72, commsDoorZ + 0.03], materials.trim);
  addProp([0.24, 2.55, 0.34], [-1.86, 1.38, commsDoorZ + 0.03], materials.trim);
  addProp([0.24, 2.55, 0.34], [1.86, 1.38, commsDoorZ + 0.03], materials.trim);
  addProp([2.85, 0.12, 0.06], [0, 2.32, commsDoorZ + 0.22], materials.hazard);
  addProp([0.54, 0.86, 0.09], [1.78, 1.35, commsDoorZ + 0.24], materials.darkRubber);
  addProp([0.34, 0.18, 0.12], [1.78, 1.54, commsDoorZ + 0.31], materials.cyanLight);
  addProp([0.28, 0.14, 0.12], [1.78, 1.2, commsDoorZ + 0.31], materials.amberLight);

  addProp([1.25, 1.45, 0.42], [0, 0.92, -39.2], materials.trim);
  addProp([0.95, 0.82, 0.48], [0, 1.62, -39.2], materials.darkRubber);
  addProp([0.72, 0.18, 0.52], [0, 2.18, -39.2], materials.cyanLight);
  addProp([0.16, 0.9, 0.16], [-0.54, 2.32, -39.2], materials.darkRubber);
  addProp([0.16, 0.9, 0.16], [0.54, 2.32, -39.2], materials.darkRubber);
  addProp([1.7, 0.08, 0.08], [0, 2.78, -39.2], materials.darkRubber);

  for (const [x, y, z, sx, sy, sz] of [
    [-0.9, 2.54, -38.8, 0.06, 0.06, 2.2],
    [0.92, 2.38, -38.55, 0.05, 0.05, 2.6],
    [-1.55, 1.9, -35.2, 0.05, 0.76, 0.05],
    [1.5, 1.84, -35.5, 0.05, 0.62, 0.05],
  ] as const) {
    addProp([sx, sy, sz], [x, y, z], materials.darkRubber);
  }

  addProp([0.82, 0.24, 1.1], [-0.86, 0.18, -36.72], materials.darkRubber);
  addProp([0.42, 0.22, 0.42], [-1.36, 0.24, -37.34], materials.trim);
  addProp([0.2, 0.16, 0.78], [-0.28, 0.17, -36.2], materials.darkRubber);
  addProp([0.2, 0.16, 0.88], [-1.42, 0.16, -36.18], materials.darkRubber);
  const commsBlood = new Mesh(new PlaneGeometry(1.2, 0.64), materials.bloodDecal);
  commsBlood.position.set(-0.92, 0.016, -36.82);
  commsBlood.rotation.x = -Math.PI / 2;
  scene.add(commsBlood);

  const commsAmberLight = new PointLight(LOOK.amber, 0, 6.2, 2.1);
  commsAmberLight.position.set(1.46, 1.6, commsDoorZ + 0.75);
  scene.add(commsAmberLight);
  const commsCyanLight = new PointLight(LOOK.cyan, 0, 7.5, 2.0);
  commsCyanLight.position.set(-0.2, 2.0, -39.0);
  scene.add(commsCyanLight);

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
      commsAmberLight.intensity = (15 + Math.max(0, Math.sin(t * 5.4)) * 24) * amberStutter;
      commsCyanLight.intensity = (12 + Math.max(0, Math.sin(t * 2.7 + 0.4)) * 18) * cyanStutter;
      materials.hazard.emissive.setHex(LOOK.amber);
      materials.hazard.emissiveIntensity = 0.1 + Math.max(0, Math.sin(t * 2.1)) * 0.05;
    },
  };
}
