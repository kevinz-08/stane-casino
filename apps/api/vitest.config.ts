import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Unit tests: no database, no network. `*.test.ts` next to the code. */
export default defineConfig({
  // SWC instead of esbuild so decorator metadata (Nest DI) is emitted.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['reflect-metadata'],
  },
});
