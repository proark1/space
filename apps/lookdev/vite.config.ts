import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// SIGNAL LOST — M-LOOK look-dev harness. Exercises @sl/render against greybox / CC0 geometry to
// prove the M-LOOK GREEN bar; only the package code survives the gate. Workspace packages are
// aliased to source so Vite bundles + HMRs them directly (same pattern as apps/client).
export default defineConfig({
  resolve: {
    alias: {
      '@sl/render': fileURLToPath(new URL('../../packages/render/src/index.ts', import.meta.url)),
      '@sl/engine': fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)),
    },
  },
  server: { port: 5181 },
});
