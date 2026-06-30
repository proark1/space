import { BoxGeometry, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Scene } from 'three';
import { LOOK, applyLookdevAtmosphere, createDustField, createIndustrialMaterials } from './look';

/** Greybox corridor dimensions (m): width × height × length. */
export const CORRIDOR = { W: 4, H: 3, L: 32 } as const;

export type CorridorMaterialKey = 'floor' | 'wall' | 'crate';

/** A static box — a centre + half-extents — from which a Rapier collider is built in the walk scene. */
export interface CorridorBox {
  readonly pos: readonly [number, number, number];
  readonly half: readonly [number, number, number];
  readonly material: CorridorMaterialKey;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

export interface CorridorLevel {
  readonly id: 'corridor-greybox';
  readonly playerSpawn: { readonly x: number; readonly y: number; readonly z: number };
  readonly boxes: readonly CorridorBox[];
}

export interface CorridorBuild {
  /** Solid surfaces (floor/ceiling/walls/end-caps/crates); each backs a static collider. */
  readonly colliders: readonly CorridorBox[];
  readonly level: CorridorLevel;
  /** Per-frame material life for shared scene dressing (panel flicker, emergency glow). */
  update(dt: number): void;
}

/**
 * Reusable greybox level descriptor: render boxes, matching static colliders, and the local player
 * spawn live together so lookdev, game boot, and later asset loading consume the same data.
 */
export function createCorridorLevel(): CorridorLevel {
  const { W, H, L } = CORRIDOR;
  const boxes: CorridorBox[] = [];
  const add = (
    geo: readonly [number, number, number],
    pos: readonly [number, number, number],
    material: CorridorMaterialKey,
    castShadow: boolean,
    receiveShadow: boolean,
  ): void => {
    boxes.push({ pos, half: [geo[0] / 2, geo[1] / 2, geo[2] / 2], material, castShadow, receiveShadow });
  };

  add([W, 0.2, L], [0, -0.1, 0], 'floor', false, true); // floor (top face at y=0)
  add([W, 0.2, L], [0, H, 0], 'wall', true, true); // ceiling
  add([0.2, H, L], [-W / 2, H / 2, 0], 'wall', true, true); // left wall
  add([0.2, H, L], [W / 2, H / 2, 0], 'wall', true, true); // right wall
  add([W, H, 0.2], [0, H / 2, -L / 2], 'wall', true, true); // far end-cap (closes the void)
  add([W, H, 0.2], [0, H / 2, L / 2], 'wall', true, true); // near end-cap

  // crates down the hall — the shadow casters that sell the flashlight + the obstacles you slide past
  for (const [x, z, s] of [
    [-1.0, -4, 0.8],
    [1.2, -9, 1.1],
    [-0.6, -15, 0.7],
    [0.9, 1, 0.9],
    [0.4, -22, 1.0],
  ] as const) {
    add([s, s, s], [x, s / 2, z], 'crate', true, true);
  }

  return { id: 'corridor-greybox', playerSpawn: { x: 0, y: 1.0, z: 12 }, boxes };
}

/**
 * Build the canonical greybox corridor into a scene — the single source of the hallway geometry shared
 * by the look-only corridor (auto-cam) and the walkable slice. A near-black hall lit by the camera
 * flashlight + a whisper of cold hemisphere fill, with crates as the shadow casters. Mid-grey albedos
 * keep flatlit surfaces above the posterize floor; real low-poly kit (T38–T40) drops in once an art
 * direction is picked. Returns the level descriptors so the walk scene can mirror them as colliders.
 */
export function buildCorridor(scene: Scene, level = createCorridorLevel()): CorridorBuild {
  const { W, H, L } = CORRIDOR;
  applyLookdevAtmosphere(scene);

  const materials = createIndustrialMaterials();
  const colliderMaterials: Record<CorridorMaterialKey, typeof materials.wall> = {
    wall: materials.wall,
    floor: materials.floor,
    crate: materials.crate,
  };

  for (const box of level.boxes) {
    const mesh = new Mesh(
      new BoxGeometry(box.half[0] * 2, box.half[1] * 2, box.half[2] * 2),
      colliderMaterials[box.material],
    );
    mesh.position.set(box.pos[0], box.pos[1], box.pos[2]);
    mesh.castShadow = box.castShadow;
    mesh.receiveShadow = box.receiveShadow;
    scene.add(mesh);
  }

  const matrix = new Matrix4();
  const ribZ = [-14, -10, -6, -2, 2, 6, 10, 14];

  const wallRibs = new InstancedMesh(new BoxGeometry(0.16, H + 0.08, 0.16), materials.trim, ribZ.length * 2);
  let instance = 0;
  for (const z of ribZ) {
    matrix.makeTranslation(-W / 2 + 0.14, H / 2, z);
    wallRibs.setMatrixAt(instance++, matrix);
    matrix.makeTranslation(W / 2 - 0.14, H / 2, z);
    wallRibs.setMatrixAt(instance++, matrix);
  }
  wallRibs.castShadow = true;
  wallRibs.receiveShadow = true;
  scene.add(wallRibs);

  const ceilingRibs = new InstancedMesh(new BoxGeometry(W + 0.08, 0.14, 0.18), materials.trim, ribZ.length);
  instance = 0;
  for (const z of ribZ) {
    matrix.makeTranslation(0, H - 0.18, z);
    ceilingRibs.setMatrixAt(instance++, matrix);
  }
  ceilingRibs.castShadow = true;
  ceilingRibs.receiveShadow = true;
  scene.add(ceilingRibs);

  const stripZ = [-14.2, -11.4, -8.6, -5.8, -3, -0.2, 2.6, 5.4, 8.2, 11];
  const warningStrips = new InstancedMesh(new BoxGeometry(0.06, 0.055, 1.35), materials.hazard, stripZ.length * 2);
  instance = 0;
  for (const z of stripZ) {
    matrix.makeTranslation(-W / 2 + 0.18, 0.18, z);
    warningStrips.setMatrixAt(instance++, matrix);
    matrix.makeTranslation(W / 2 - 0.18, 0.18, z);
    warningStrips.setMatrixAt(instance++, matrix);
  }
  warningStrips.receiveShadow = true;
  scene.add(warningStrips);

  const grateZ = [-13.2, -9.2, -5.2, -1.2, 2.8, 6.8, 10.8];
  const floorGrates = new InstancedMesh(new BoxGeometry(W - 0.7, 0.025, 0.055), materials.trim, grateZ.length * 4);
  instance = 0;
  for (const z of grateZ) {
    for (const offset of [-0.42, -0.14, 0.14, 0.42]) {
      matrix.makeTranslation(0, 0.025, z + offset);
      floorGrates.setMatrixAt(instance++, matrix);
    }
  }
  floorGrates.receiveShadow = true;
  scene.add(floorGrates);

  const addPanel = (x: number, y: number, z: number, material: typeof materials.amberLight): void => {
    const panel = new Mesh(new BoxGeometry(0.055, 0.42, 0.82), material);
    panel.position.set(x, y, z);
    panel.castShadow = false;
    panel.receiveShadow = false;
    scene.add(panel);
  };
  addPanel(W / 2 - 0.12, 1.42, -7.4, materials.amberLight);
  addPanel(-W / 2 + 0.12, 1.3, -12.8, materials.cyanLight);
  addPanel(-W / 2 + 0.12, 1.7, 5.2, materials.amberLight);
  addPanel(W / 2 - 0.12, 1.52, -20.8, materials.cyanLight);

  const leftBlood = new Mesh(new PlaneGeometry(0.92, 0.54), materials.bloodDecal);
  leftBlood.position.set(-W / 2 + 0.106, 1.08, -11.35);
  leftBlood.rotation.y = Math.PI / 2;
  scene.add(leftBlood);

  const floorScorch = new Mesh(new PlaneGeometry(1.4, 0.78), materials.scorchDecal);
  floorScorch.position.set(0.66, 0.014, -17.25);
  floorScorch.rotation.x = -Math.PI / 2;
  scene.add(floorScorch);

  const conduit = new Mesh(new BoxGeometry(0.07, 0.07, 2.1), materials.darkRubber);
  conduit.position.set(W / 2 - 0.22, 2.38, -18.6);
  conduit.castShadow = true;
  scene.add(conduit);
  for (const [y, z, h] of [
    [2.0, -18.0, 0.72],
    [1.86, -18.45, 0.96],
    [2.08, -18.9, 0.58],
  ] as const) {
    const cable = new Mesh(new BoxGeometry(0.035, h, 0.035), materials.darkRubber);
    cable.position.set(W / 2 - 0.24, y - h / 2, z);
    cable.castShadow = true;
    scene.add(cable);
  }

  const farBeacon = new Mesh(new BoxGeometry(0.92, 0.12, 0.055), materials.amberLight);
  farBeacon.position.set(0, 2.42, -L / 2 + 0.12);
  scene.add(farBeacon);

  scene.add(createDustField(W * 0.9, H * 0.85, L * 0.92, 220));

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
