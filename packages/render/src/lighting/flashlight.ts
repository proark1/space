import { SpotLight, Vector3, Quaternion } from 'three';
import type { Camera, Scene } from 'three';
import type { RenderProfile } from '../RenderProfile';

const _pos = new Vector3();
const _quat = new Quaternion();
const _dir = new Vector3();

export interface Flashlight {
  readonly light: SpotLight;
  /** Add the spotlight + its aim target to the scene. */
  addToScene(scene: Scene): void;
  /** Ride the camera: position the cone at the eye, aimed down the view forward; refresh the shadow
   *  only when the light has actually moved (the autoUpdate=false controller). */
  update(camera: Camera): void;
  setOn(on: boolean): void;
}

/**
 * The player flashlight (T30): a SpotLight that rides the camera and is the ONLY realtime shadow
 * caster in the near-black corridor (everything else is baked). Shadow resolution comes from the
 * RenderProfile (1024 WebGPU / 512 WebGL2). `shadow.autoUpdate` is OFF — the controller re-renders
 * the shadow only when the light moves, so a still flashlight costs zero shadow re-renders per frame.
 */
export function createFlashlight(profile: RenderProfile): Flashlight {
  // Intensity is in candela (WebGPU physical lighting); a handheld flashlight needs a few hundred,
  // not the pre-port "6.0" that read as fully black once the fog/vignette/posterize stack crushed it.
  const light = new SpotLight(0xfff2e0, 240.0, 18, Math.PI / 5, 0.4, 2.0);
  light.castShadow = true;
  light.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
  light.shadow.camera.near = 0.2;
  light.shadow.camera.far = 18;
  light.shadow.bias = -0.0006;
  light.shadow.autoUpdate = false;
  light.shadow.needsUpdate = true;

  const lastPos = new Vector3(Infinity, 0, 0);
  const lastQuat = new Quaternion(2, 0, 0, 0); // out-of-range → forces the first shadow render

  return {
    light,
    addToScene(scene: Scene): void {
      scene.add(light);
      scene.add(light.target);
    },
    update(camera: Camera): void {
      camera.getWorldPosition(_pos);
      camera.getWorldDirection(_dir);
      light.position.copy(_pos);
      light.target.position.copy(_pos).addScaledVector(_dir, 6);
      camera.getWorldQuaternion(_quat);
      if (_pos.distanceToSquared(lastPos) > 1e-6 || _quat.angleTo(lastQuat) > 1e-4) {
        light.shadow.needsUpdate = true;
        lastPos.copy(_pos);
        lastQuat.copy(_quat);
      }
    },
    setOn(on: boolean): void {
      light.visible = on;
    },
  };
}
