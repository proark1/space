import { Scene, PerspectiveCamera } from 'three';
import { createFlashlight } from '@sl/render';
import type { RenderProfile } from '@sl/render';
import type { HarnessScene } from './scene';
import { buildCorridor } from './corridor';

/**
 * Look-only corridor (M-LOOK Scene B, T30 demo): the canonical greybox hallway ({@link buildCorridor})
 * under a scripted handheld camera sway, driven through the PS1 post stack. Shares its geometry with
 * the walkable slice ({@link createWalkScene}) so the look and the playable register stay identical;
 * this variant just swaps player control for an automated sway that exercises the flashlight's
 * shadow-update controller. Reach it with `?scene=corridor`.
 */
export function createCorridorScene(profile: RenderProfile): HarnessScene {
  const scene = new Scene();
  buildCorridor(scene);

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
