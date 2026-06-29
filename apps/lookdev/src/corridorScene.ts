import {
  Scene,
  PerspectiveCamera,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  HemisphereLight,
} from 'three';
import { createFlashlight } from '@sl/render';
import type { RenderProfile } from '@sl/render';
import type { HarnessScene } from './scene';

/**
 * Greybox corridor (M-LOOK Scene B, T30 demo). A near-black hallway lit ONLY by the camera
 * flashlight + a whisper of hemisphere fill, with a few crates casting shadows. Driven through the
 * PS1 post stack (fog/grade/vignette/posterize) this is the first look at the actual SIGNAL LOST
 * mood — real low-poly kit geometry (T38-T40) drops straight into this rig once the art direction
 * is picked. A gentle camera sway exercises the flashlight's shadow-update controller.
 */
export function createCorridorScene(profile: RenderProfile): HarnessScene {
  const scene = new Scene();
  // A whisper of cold ambient so absolute-black normals don't read as void (spec 06). Lifted a touch
  // above pure dark so flashlit greybox surfaces clear the posterize floor (the baked lightmap will
  // own this base level in the real corridor).
  scene.add(new HemisphereLight(0x141a22, 0x05070a, 0.5));

  // Mid-grey greybox albedos (the near-black placeholder read as pure void after posterize).
  const wallMat = new MeshStandardMaterial({ color: 0x8a9099, roughness: 0.9, metalness: 0.0, flatShading: true });
  const floorMat = new MeshStandardMaterial({ color: 0x6a6f76, roughness: 1.0, metalness: 0.0, flatShading: true });
  const crateMat = new MeshStandardMaterial({ color: 0x9a8a6e, roughness: 0.85, metalness: 0.0, flatShading: true });

  const W = 4;
  const H = 3;
  const L = 32;

  const add = (mesh: Mesh, cast: boolean, receive: boolean): void => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    scene.add(mesh);
  };

  const floor = new Mesh(new BoxGeometry(W, 0.2, L), floorMat);
  floor.position.set(0, -0.1, 0);
  add(floor, false, true);

  const ceiling = new Mesh(new BoxGeometry(W, 0.2, L), wallMat);
  ceiling.position.set(0, H, 0);
  add(ceiling, true, true);

  const leftWall = new Mesh(new BoxGeometry(0.2, H, L), wallMat);
  leftWall.position.set(-W / 2, H / 2, 0);
  add(leftWall, true, true);

  const rightWall = new Mesh(new BoxGeometry(0.2, H, L), wallMat);
  rightWall.position.set(W / 2, H / 2, 0);
  add(rightWall, true, true);

  // crates down the hall — the shadow casters that sell the flashlight
  for (const [x, z, s] of [
    [-1.0, -4, 0.8],
    [1.2, -9, 1.1],
    [-0.6, -15, 0.7],
    [0.9, 1, 0.9],
    [0.4, -22, 1.0],
  ] as const) {
    const crate = new Mesh(new BoxGeometry(s, s, s), crateMat);
    crate.position.set(x, s / 2, z);
    add(crate, true, true);
  }

  const camera = new PerspectiveCamera(70, 1, 0.1, 60);
  camera.position.set(0, 1.6, 13);

  const flashlight = createFlashlight(profile);
  flashlight.addToScene(scene);

  let t = 0;
  const aim = (): void => camera.lookAt(Math.sin(t * 0.3) * 0.5, 0.7, -10);
  aim();
  flashlight.update(camera);

  return {
    scene,
    camera,
    label: 'corridor',
    fixedStep() {
      /* no host physics in the look-only corridor */
    },
    frameUpdate(dt) {
      t += dt;
      // subtle head bob + sway so the flashlight (and its shadows) feel handheld
      camera.position.y = 1.6 + Math.sin(t * 1.6) * 0.04;
      camera.position.x = Math.sin(t * 0.5) * 0.18;
      aim();
      flashlight.update(camera);
    },
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
  };
}
