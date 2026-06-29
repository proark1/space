// SIGNAL LOST — load a Unit Forge GLB into a scene with per-state animation playback.
// Used by the game (index.html) for the CHORUS and the crew bench (units.html) for the crew.
// loadUnitModel() returns null if the unit has no model yet, so callers keep their procedural fallback.
// The returned instance has .instance() to spawn more independent copies (own mixer) — for crews/enemies.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const _loader = new GLTFLoader();

// game state -> ordered clip-name substrings to look for (case-insensitive). First match wins.
const STATE_CLIPS = {
  idle:   ['idle', 'breath', 'stand', 'rest'],
  walk:   ['walk', 'creep'],
  run:    ['run', 'sprint', 'chase'],
  attack: ['attack', 'lunge', 'punch', 'bite', 'melee', 'hit', 'swipe'],
  death:  ['death', 'die', 'dead'],
};

// Build one independent, normalized, animatable instance from a (pristine) source scene + clips.
function buildInstance(srcScene, clips, norm, opts) {
  const inner = cloneSkeleton(srcScene);                 // SkeletonUtils handles skinned meshes correctly
  inner.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  inner.position.copy(norm.pos);                          // center x/z + feet on the floor
  if (opts.yaw) inner.rotation.y = opts.yaw;              // flip if the model faces the wrong way
  const root = new THREE.Group();
  root.add(inner);
  root.scale.setScalar(norm.scale);                       // scale to the requested height

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
    if (!clip || clip === curClip) return;               // already playing it
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

// loadUnitModel(id, { src?, rigged?, height?, yaw? }) -> instance | null
// instance also has .instance() -> another independent copy (own mixer), for spawning a crew/swarm.
export async function loadUnitModel(id, opts = {}) {
  const src = opts.src || ('/u/' + id + (opts.rigged ? '_rigged' : '') + '.glb');
  let gltf;
  try { gltf = await _loader.loadAsync(src); }
  catch (e) { return null; }                              // 404 / not forged yet -> caller keeps its fallback

  const srcScene = gltf.scene, clips = gltf.animations || [];
  const box = new THREE.Box3().setFromObject(srcScene);   // measure the pristine model once
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const targetH = opts.height || 1.8;
  const norm = { pos: new THREE.Vector3(-center.x, -box.min.y, -center.z), scale: targetH / (size.y || 1) };

  const first = buildInstance(srcScene, clips, norm, opts);
  first.instance = () => buildInstance(srcScene, clips, norm, opts);
  return first;
}
