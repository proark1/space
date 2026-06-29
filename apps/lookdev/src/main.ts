// SIGNAL LOST — M-LOOK harness entry (T24).
// Brings up the real renderer (WebGPU, or WebGL2 via ?gl=2 / fallback) and drives a clear-color
// frame + a rotating greybox cube through the engine GameLoop — the first end-to-end proof that
// @sl/render and @sl/engine compose. Later tasks replace the cube with the corridor + post stack.
import { Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshNormalMaterial } from 'three';
import { createRenderer } from '@sl/render';
import { GameLoop } from '@sl/engine';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const hud = document.getElementById('hud');

async function main(): Promise<void> {
  // ?gl=2 forces the WebGL2 fallback path; ?tier=low|mid|high|ultra picks the quality tier.
  const params = new URLSearchParams(location.search);
  const forceBackend = params.get('gl') === '2' ? 'webgl2' : undefined;
  const tierParam = params.get('tier');
  const tier = (['low', 'mid', 'high', 'ultra'] as const).find((t) => t === tierParam);
  const renderer = await createRenderer({ canvas, forceBackend, tier });

  const scene = new Scene();
  const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 4);

  const cube = new Mesh(new BoxGeometry(1.4, 1.4, 1.4), new MeshNormalMaterial());
  scene.add(cube);

  const resize = (): void => {
    // Fall back to a sane size when the host reports a 0-size viewport (e.g. headless verification),
    // so the canvas + camera aspect never collapse to 0 / NaN.
    const w = window.innerWidth || canvas.clientWidth || 960;
    const h = window.innerHeight || canvas.clientHeight || 600;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const loop = new GameLoop({
    fixedHz: 60,
    fixedUpdate: (dt) => {
      cube.rotation.x += dt * 0.6;
      cube.rotation.y += dt * 0.8;
    },
    render: () => renderer.render(scene, camera),
  });
  loop.start();

  const p = renderer.profile;
  if (hud) {
    hud.textContent = `SIGNAL LOST · ${p.backend} · tier ${p.tier} · dpr ${p.pixelRatio} · shadow ${p.shadowMapSize} · ssr ${p.ssr} · fog ${p.fog}`;
  }
  // Expose for headless verification (assert backend/profile + that the loop is running, no throw).
  (window as unknown as { __sl?: unknown }).__sl = { renderer, loop, scene, camera, backend: renderer.backend, profile: renderer.profile };
}

main().catch((err: unknown) => {
  console.error('[lookdev] renderer init failed', err);
  if (hud) hud.textContent = `init failed: ${String(err)}`;
});
