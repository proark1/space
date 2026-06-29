// SIGNAL LOST — load a Unit Forge GLB into a scene with per-state animation playback.
// Used by the game (index.html) to swap a procedural unit for a forged/uploaded model when one exists.
// Returns null if the unit has no model yet, so the caller keeps its procedural fallback.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const _loader = new GLTFLoader();

// game state -> ordered clip-name substrings to look for (case-insensitive). First match wins.
const STATE_CLIPS = {
  idle:   ['idle', 'breath', 'stand', 'rest'],
  walk:   ['walk', 'creep'],
  run:    ['run', 'sprint', 'chase'],
  attack: ['attack', 'lunge', 'punch', 'bite', 'melee', 'hit', 'swipe'],
  death:  ['death', 'die', 'dead'],
};

// loadUnitModel(id, { src?, rigged?, height?, yaw? }) -> { root, mixer, clips, clipNames, play, update, current } | null
export async function loadUnitModel(id, opts = {}) {
  const src = opts.src || ('/u/' + id + (opts.rigged ? '_rigged' : '') + '.glb');
  let gltf;
  try { gltf = await _loader.loadAsync(src); }
  catch (e) { return null; }                       // 404 / not forged yet -> caller keeps its fallback

  const inner = gltf.scene;
  inner.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });

  // normalize: center on x/z, feet at y=0, scale to a target height so it drops into the scene predictably
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const targetH = opts.height || 1.8;
  inner.position.set(-center.x, -box.min.y, -center.z);
  if (opts.yaw) inner.rotation.y = opts.yaw;        // flip if the model faces the wrong way
  const root = new THREE.Group();
  root.add(inner);
  root.scale.setScalar(targetH / (size.y || 1));

  const clips = gltf.animations || [];
  const mixer = clips.length ? new THREE.AnimationMixer(inner) : null;
  const clipFor = state => {
    if (!clips.length) return null;
    for (const sub of (STATE_CLIPS[state] || [])) {
      const c = clips.find(c => (c.name || '').toLowerCase().includes(sub));
      if (c) return c;
    }
    return null;
  };

  let curAction = null, curClip = null;
  function play(state, fade = 0.25) {
    if (!mixer) return;
    const clip = clipFor(state) || clips[0];
    if (!clip || clip === curClip) return;          // already playing it
    const next = mixer.clipAction(clip);
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (curAction && curAction !== next) curAction.fadeOut(fade);
    curAction = next; curClip = clip;
  }
  if (mixer) play('idle', 0);

  return {
    root, mixer, clips, clipNames: clips.map(c => c.name),
    play,
    update: dt => { if (mixer) mixer.update(dt); },
    get current() { return curClip ? curClip.name : null; },
  };
}
