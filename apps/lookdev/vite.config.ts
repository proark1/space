import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// SIGNAL LOST — M-LOOK look-dev harness. Exercises @sl/render + @sl/engine against greybox / CC0
// geometry to prove the M-LOOK GREEN bar. All workspace packages are aliased to source so Vite
// bundles + HMRs them directly (same pattern as apps/client).
const src = (p: string) => fileURLToPath(new URL(`../../packages/${p}/src/index.ts`, import.meta.url));

export default defineConfig({
  base: process.env.SL_LOOKDEV_BASE ?? '/',
  build: {
    chunkSizeWarningLimit: 2400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/@dimforge/rapier3d-compat/')) return 'vendor-rapier';
          if (id.includes('/three/')) return 'vendor-three';
          if (id.includes('/react') || id.includes('/zustand/')) return 'vendor-ui';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@sl/render': src('render'),
      '@sl/engine': src('engine'),
      '@sl/ecs': src('ecs'),
      '@sl/ui': src('ui'),
      '@sl/netcode': src('netcode'),
      '@sl/shared-types': src('shared-types'),
    },
  },
  server: { port: 5181 },
});
