// SIGNAL LOST — M-LOOK harness entry.
// Default scene is the greybox corridor (the look): a near-black hallway lit by the camera
// flashlight, run through the PS1 post stack. ?scene=chaos switches to the Phase B perf probe
// (`n` dynamic Rapier boxes, 300 by default). ?gl=2 forces the WebGL2 floor; ?tier=low|mid|high|ultra.
import { createRenderer, createPostStack } from '@sl/render';
import { GameLoop } from '@sl/engine';
import { createChaosScene } from './chaosScene';
import { createCorridorScene } from './corridorScene';
import type { HarnessScene } from './scene';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const hud = document.getElementById('hud');

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const forceBackend = params.get('gl') === '2' ? 'webgl2' : undefined;
  const tier = (['low', 'mid', 'high', 'ultra'] as const).find((t) => t === params.get('tier'));
  const count = Math.max(1, Math.min(2000, Math.floor(Number(params.get('n')) || 300)));

  const renderer = await createRenderer({ canvas, forceBackend, tier });
  const harness: HarnessScene =
    params.get('scene') === 'chaos'
      ? await createChaosScene(count)
      : createCorridorScene(renderer.profile);
  const post = createPostStack(renderer, harness.scene, harness.camera, renderer.profile);

  const resize = (): void => {
    const w = window.innerWidth || canvas.clientWidth || 960;
    const h = window.innerHeight || canvas.clientHeight || 600;
    renderer.setSize(w, h);
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
    hud.textContent = `SIGNAL LOST · ${p.backend} · tier ${p.tier} · ${harness.label} · ${fps} fps · ${renderer.three.info.render.drawCalls} draws`;
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
  };
}

main().catch((err: unknown) => {
  console.error('[lookdev] init failed', err);
  if (hud) hud.textContent = `init failed: ${String(err)}`;
});
