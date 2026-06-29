import { Scene, Mesh, BoxGeometry, MeshStandardMaterial, HemisphereLight } from 'three';

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
  scene.add(new HemisphereLight(0x141a22, 0x05070a, 0.5));

  const materials: Record<CorridorMaterialKey, MeshStandardMaterial> = {
    wall: new MeshStandardMaterial({ color: 0x8a9099, roughness: 0.9, metalness: 0.0, flatShading: true }),
    floor: new MeshStandardMaterial({ color: 0x6a6f76, roughness: 1.0, metalness: 0.0, flatShading: true }),
    crate: new MeshStandardMaterial({ color: 0x9a8a6e, roughness: 0.85, metalness: 0.0, flatShading: true }),
  };

  for (const box of level.boxes) {
    const mesh = new Mesh(
      new BoxGeometry(box.half[0] * 2, box.half[1] * 2, box.half[2] * 2),
      materials[box.material],
    );
    mesh.position.set(box.pos[0], box.pos[1], box.pos[2]);
    mesh.castShadow = box.castShadow;
    mesh.receiveShadow = box.receiveShadow;
    scene.add(mesh);
  }

  return { colliders: level.boxes, level };
}
