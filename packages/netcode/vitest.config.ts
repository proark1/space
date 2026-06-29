import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@sl/ecs': fileURLToPath(
        new URL('../ecs/src/index.ts', import.meta.url),
      ),
      '@sl/shared-types': fileURLToPath(
        new URL('../shared-types/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
