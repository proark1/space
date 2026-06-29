import {
  Scene,
  PerspectiveCamera,
  InstancedMesh,
  BoxGeometry,
  MeshNormalMaterial,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { PhysicsWorld, type PhysicsBox } from '@sl/engine';
import type { HarnessScene } from './scene';

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

  const mesh = new InstancedMesh(
    new BoxGeometry(half * 2, half * 2, half * 2),
    new MeshNormalMaterial(),
    count,
  );
  mesh.frustumCulled = false;

  const scene = new Scene();
  scene.add(mesh);
  const camera = new PerspectiveCamera(58, 1, 0.1, 200);
  camera.position.set(0, 9, 17);
  camera.lookAt(0, 1.5, 0);

  const m = new Matrix4();
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3(1, 1, 1);

  return {
    scene,
    camera,
    label: `chaos ${count}`,
    fixedStep() {
      physics.step();
    },
    frameUpdate() {
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
