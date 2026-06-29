import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// SIGNAL LOST — M-LOOK look-dev harness. Exercises @sl/render + @sl/engine against greybox / CC0
// geometry to prove the M-LOOK GREEN bar. All workspace packages are aliased to source so Vite
// bundles + HMRs them directly (same pattern as apps/client).
const src = (p: string) => fileURLToPath(new URL(`../../packages/${p}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@sl/render': src('render'),
      '@sl/engine': src('engine'),
      '@sl/ecs': src('ecs'),
      '@sl/shared-types': src('shared-types'),
    },
  },
  server: { port: 5181 },
});
