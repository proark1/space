// SIGNAL LOST — M-LOOK harness entry.
// Default scene is the Phase B chaos-stress harness: `n` dynamic Rapier boxes (300 by default)
// rendered as one InstancedMesh — the perf-headroom probe for the low-poly GREEN bar (B3). Query
// params: ?n=N body count, ?gl=2 forces the WebGL2 fallback, ?tier=low|mid|high|ultra quality tier.
import { createRenderer, createPostStack } from '@sl/render';
import { GameLoop } from '@sl/engine';
import { createChaosScene } from './chaosScene';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const hud = document.getElementById('hud');

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const forceBackend = params.get('gl') === '2' ? 'webgl2' : undefined;
  const tier = (['low', 'mid', 'high', 'ultra'] as const).find((t) => t === params.get('tier'));
  const count = Math.max(1, Math.min(2000, Math.floor(Number(params.get('n')) || 300)));

  const renderer = await createRenderer({ canvas, forceBackend, tier });
  const chaos = await createChaosScene(count);
  const post = createPostStack(renderer, chaos.scene, chaos.camera, renderer.profile);

  const resize = (): void => {
    const w = window.innerWidth || canvas.clientWidth || 960;
    const h = window.innerHeight || canvas.clientHeight || 600;
    renderer.setSize(w, h);
    chaos.resize(w, h);
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
    hud.textContent = `SIGNAL LOST · ${p.backend} · tier ${p.tier} · ${chaos.bodyCount} bodies · ${fps} fps · ${renderer.three.info.render.drawCalls} draws`;
  };

  const loop = new GameLoop({
    fixedHz: 60,
    fixedUpdate: () => chaos.step(),
    render: () => {
      chaos.syncInstances();
      post.render();
      const now = performance.now();
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

  // Expose for verification: __sl.benchmark(frames) times CPU step+sync synchronously (headless),
  // returning ms/frame + draw calls; the on-screen meter reports real GPU-bound fps in a browser.
  (window as unknown as { __sl?: unknown }).__sl = {
    renderer,
    loop,
    chaos,
    post,
    backend: renderer.backend,
    profile: renderer.profile,
    benchmark: (f = 180) => {
      const r = chaos.benchmark(f);
      renderer.render(chaos.scene, chaos.camera);
      return {
        ...r,
        bodies: chaos.bodyCount,
        backend: renderer.backend,
        drawCalls: renderer.three.info.render.drawCalls,
      };
    },
  };
}

main().catch((err: unknown) => {
  console.error('[lookdev] init failed', err);
  if (hud) hud.textContent = `init failed: ${String(err)}`;
});
