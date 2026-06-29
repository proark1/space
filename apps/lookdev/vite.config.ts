import { defineConfig } from 'vite';

// SIGNAL LOST — M-LOOK look-dev harness. This throwaway app exercises @sl/render against
// greybox / CC0 geometry to prove the M-LOOK GREEN bar; only the package code survives the gate.
// T24 adds the @sl/render → src alias and the real renderer bootstrap.
export default defineConfig({
  server: { port: 5181 },
});
