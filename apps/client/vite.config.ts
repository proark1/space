import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Resolve workspace packages to their TS source so Vite bundles fresh (HMR-friendly) and
// the client never depends on a pre-built dist. WASM/three/manualChunks land with M1.
const src = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // React only compiles the HUD files. `global` shim covers libs that expect it (trystero deps).
  plugins: [react({ include: /ui\/.*\.tsx?$/ })],
  define: { global: 'globalThis' },
  resolve: {
    alias: {
      '@sl/shared-types': src('../../packages/shared-types/src/index.ts'),
      '@sl/netcode': src('../../packages/netcode/src/index.ts'),
      '@sl/ecs': src('../../packages/ecs/src/index.ts'),
    },
  },
  server: { port: 5180, strictPort: true },
  build: { target: 'es2022', sourcemap: true, assetsInlineLimit: 0 },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
});
