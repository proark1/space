// SIGNAL LOST — M-LOOK harness entry.
// Default scene is the WALKABLE slice: first-person WASD + mouse-look through the greybox corridor,
// the player capsule driven by the Rapier KCC and the camera/flashlight riding its ECS Transform.
// ?scene=corridor is the look-only auto-cam variant; ?scene=chaos is the Phase B perf probe (`n`
// dynamic Rapier boxes, 300 by default). ?gl=2 forces the WebGL2 floor; ?tier=low|mid|high|ultra.
import { createRenderer, createPostStack } from '@sl/render';
import { GameLoop } from '@sl/engine';
import { useHudStore } from '@sl/ui';
import { createChaosScene } from './chaosScene';
import { createCorridorScene } from './corridorScene';
import { createWalkScene } from './walkScene';
import type { HarnessScene } from './scene';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const hud = document.getElementById('hud');

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const forceBackend = params.get('gl') === '2' ? 'webgl2' : undefined;
  const tier = (['low', 'mid', 'high', 'ultra'] as const).find((t) => t === params.get('tier'));
  const count = Math.max(1, Math.min(2000, Math.floor(Number(params.get('n')) || 300)));

  const renderer = await createRenderer({ canvas, forceBackend, tier });
  const sceneParam = params.get('scene');
  const harness: HarnessScene =
    sceneParam === 'chaos'
      ? await createChaosScene(count)
      : sceneParam === 'corridor'
        ? createCorridorScene(renderer.profile)
        : await createWalkScene(renderer.profile, canvas);
  const post = createPostStack(renderer, harness.scene, harness.camera, renderer.profile);

  // Internal-res crunch — the dominant PS1 cue (the lookdev's own technique): render at a fraction
  // and let CSS upscale with nearest (#scene { image-rendering: pixelated }). pixelRatio 1 so the
  // DPR doesn't undo the crunch; RETRO is Director-ramp ready (lower it under dread).
  const RETRO = 0.5;
  renderer.three.setPixelRatio(1);
  const resize = (): void => {
    const w = window.innerWidth || canvas.clientWidth || 960;
    const h = window.innerHeight || canvas.clientHeight || 600;
    renderer.three.setSize(Math.max(1, Math.round(w * RETRO)), Math.max(1, Math.round(h * RETRO)), false);
    // The small buffer must still DISPLAY at full size (CSS upscales it); set explicit px (= viewport
    // size in a real browser) so it survives headless 0-width 100vw and overrides three's inline px.
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    harness.resize(w, h);
  };
  window.addEventListener('resize', resize);
  resize();

  let fps = 0;
  let frames = 0;
  let acc = 0;
  let lastT = performance.now();

  const updateHud = (): void => {
    if (!hud) return;
    const p = renderer.profile;
    const drawCalls = renderer.three.info.render.drawCalls;
    const store = useHudStore.getState();
    const hint =
      harness.label === 'walk'
        ? ` · hp ${store.health} · bat ${store.battery} · ammo ${store.ammoMag}/${store.ammoReserve} · ${store.status ?? 'idle'} · WASD move · click to look · Space jump`
        : '';
    hud.textContent = `SIGNAL LOST · ${p.backend} · tier ${p.tier} · ${harness.label} · ${fps} fps · ${drawCalls} draws${hint}`;
  };

  const loop = new GameLoop({
    fixedHz: 60,
    fixedUpdate: (dt) => harness.fixedStep(dt),
    render: () => {
      const now = performance.now();
      const dt = Math.min((now - lastT) / 1000, 0.1);
      harness.frameUpdate(dt);
      post.render();
      acc += now - lastT;
      lastT = now;
      frames += 1;
      if (acc >= 500) {
        fps = Math.round((frames * 1000) / acc);
        frames = 0;
        acc = 0;
        updateHud();
      }
    },
  });

  updateHud();
  loop.start();

  // Expose for headless verification.
  (window as unknown as { __sl?: unknown }).__sl = {
    renderer,
    loop,
    harness,
    post,
    backend: renderer.backend,
    profile: renderer.profile,
    hudState: () => useHudStore.getState(),
  };
}

main().catch((err: unknown) => {
  console.error('[lookdev] init failed', err);
  if (hud) hud.textContent = `init failed: ${String(err)}`;
});
