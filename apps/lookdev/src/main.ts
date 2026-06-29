// SIGNAL LOST — M-LOOK harness entry.
// M1-A0 scaffold: confirms the app builds and a canvas mounts. T24 replaces this body with the
// real renderer bootstrap (detectBackend → WebGPURenderer/WebGL2 → scene), then later tasks add
// the post stack, flashlight, ECS→Object3D sync, and the chaos-stress scene.
const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
if (canvas) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1b2a3a';
    ctx.font = '14px monospace';
    ctx.fillText('SIGNAL LOST — look-dev harness (M1-A0 scaffold)', 24, 36);
  }
}
