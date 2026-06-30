import {
  Color,
  Scene,
  PerspectiveCamera,
  InstancedMesh,
  Mesh,
  BoxGeometry,
  PlaneGeometry,
  PointLight,
  SpotLight,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { PhysicsWorld, type PhysicsBox } from '@sl/engine';
import type { HarnessScene } from './scene';
import { LOOK, applyLookdevAtmosphere, createDustField, createIndustrialMaterials } from './look';

/**
 * M-LOOK chaos-stress harness scene (Phase B). Drops `count` dynamic Rapier boxes into a walled pen
 * and renders them as a single InstancedMesh (one draw call), syncing physics → instance matrices
 * each frame. The perf-headroom probe for the low-poly GREEN bar (B3): a locked 60 fps on a mid GPU
 * while hundreds of bodies tumble.
 */
export async function createChaosScene(count: number): Promise<HarnessScene> {
  const physics = await PhysicsWorld.create();
  physics.addGround();
  // A low pen so the pile stays in frame.
  physics.addStaticBox({ x: 0, y: 1, z: -6 }, { x: 6.3, y: 1, z: 0.3 });
  physics.addStaticBox({ x: 0, y: 1, z: 6 }, { x: 6.3, y: 1, z: 0.3 });
  physics.addStaticBox({ x: -6, y: 1, z: 0 }, { x: 0.3, y: 1, z: 6.3 });
  physics.addStaticBox({ x: 6, y: 1, z: 0 }, { x: 0.3, y: 1, z: 6.3 });

  const half = 0.4;
  const boxes: PhysicsBox[] = [];
  const perRow = 10;
  for (let i = 0; i < count; i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow) % perRow;
    const layer = Math.floor(i / (perRow * perRow));
    const x = (col - perRow / 2) * (half * 2.2) + (layer % 2) * half;
    const z = (row - perRow / 2) * (half * 2.2);
    const y = 2.5 + layer * (half * 2.4);
    boxes.push(physics.addDynamicBox({ x, y, z }, { x: half, y: half, z: half }));
  }

  const scene = new Scene();
  applyLookdevAtmosphere(scene, { fogDensity: 0.009, hemiIntensity: 0.5 });
  const materials = createIndustrialMaterials();

  const addBox = (
    size: readonly [number, number, number],
    pos: readonly [number, number, number],
    material: typeof materials.wall,
  ): Mesh => {
    const box = new Mesh(new BoxGeometry(size[0], size[1], size[2]), material);
    box.position.set(pos[0], pos[1], pos[2]);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
    return box;
  };

  addBox([14, 0.18, 14], [0, -0.09, 0], materials.floor);
  addBox([12.6, 2, 0.3], [0, 1, -6], materials.wall);
  addBox([12.6, 2, 0.3], [0, 1, 6], materials.wall);
  addBox([0.3, 2, 12.6], [-6, 1, 0], materials.wall);
  addBox([0.3, 2, 12.6], [6, 1, 0], materials.wall);

  const bayRibs = new InstancedMesh(new BoxGeometry(0.16, 2.15, 0.18), materials.trim, 16);
  let rib = 0;
  const ribMatrix = new Matrix4();
  for (const z of [-4.8, -2.4, 0, 2.4, 4.8]) {
    ribMatrix.makeTranslation(-5.78, 1.05, z);
    bayRibs.setMatrixAt(rib++, ribMatrix);
    ribMatrix.makeTranslation(5.78, 1.05, z);
    bayRibs.setMatrixAt(rib++, ribMatrix);
  }
  for (const x of [-3.6, 0, 3.6]) {
    ribMatrix.makeTranslation(x, 1.05, -5.78);
    bayRibs.setMatrixAt(rib++, ribMatrix);
    ribMatrix.makeTranslation(x, 1.05, 5.78);
    bayRibs.setMatrixAt(rib++, ribMatrix);
  }
  bayRibs.castShadow = true;
  bayRibs.receiveShadow = true;
  scene.add(bayRibs);

  const lampBar = new Mesh(new BoxGeometry(1.25, 0.12, 0.08), materials.amberLight);
  lampBar.position.set(-3.8, 2.25, 5.6);
  scene.add(lampBar);
  const coolantPanel = new Mesh(new BoxGeometry(0.08, 0.5, 0.9), materials.cyanLight);
  coolantPanel.position.set(5.78, 1.25, -3.4);
  scene.add(coolantPanel);

  const floorScorch = new Mesh(new PlaneGeometry(2.4, 1.3), materials.scorchDecal);
  floorScorch.position.set(-1.4, 0.014, 1.2);
  floorScorch.rotation.x = -Math.PI / 2;
  scene.add(floorScorch);

  const key = new SpotLight(LOOK.amber, 230, 24, Math.PI / 4.2, 0.55, 1.45);
  key.position.set(-3.2, 5.1, 6.1);
  key.target.position.set(0, 1.1, 0);
  scene.add(key);
  scene.add(key.target);
  const rim = new PointLight(LOOK.cyan, 34, 10, 2.0);
  rim.position.set(4.8, 2.2, -3.6);
  scene.add(rim);

  scene.add(createDustField(12, 2.4, 12, 180, 203));

  const mesh = new InstancedMesh(new BoxGeometry(half * 2, half * 2, half * 2), materials.crate, count);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const instanceColor = new Color();
  for (let i = 0; i < count; i++) {
    const tone = i % 11 === 0 ? LOOK.steelLight : i % 5 === 0 ? LOOK.steel : LOOK.rust;
    mesh.setColorAt(i, instanceColor.setHex(tone));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  const camera = new PerspectiveCamera(62, 1, 0.1, 120);
  camera.position.set(0, 6.2, 11.5);
  camera.lookAt(0, 1.15, 0);

  const m = new Matrix4();
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3(1, 1, 1);
  let t = 0;

  return {
    scene,
    camera,
    label: `chaos ${count}`,
    fixedStep() {
      physics.step();
    },
    frameUpdate(dt) {
      t += dt;
      const stutter = Math.sin(t * 19.0) > 0.88 ? 0.35 : 1;
      materials.amberLight.emissiveIntensity = (1.0 + Math.sin(t * 4.2) * 0.2) * stutter;
      materials.cyanLight.emissiveIntensity = 0.55 + Math.sin(t * 2.8 + 1.7) * 0.12;
      key.intensity = 215 + Math.sin(t * 3.2) * 24 * stutter;
      for (let i = 0; i < count; i++) {
        const body = boxes[i]!.body;
        const t = body.translation();
        const r = body.rotation();
        m.compose(p.set(t.x, t.y, t.z), q.set(r.x, r.y, r.z, r.w), s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
  };
}
