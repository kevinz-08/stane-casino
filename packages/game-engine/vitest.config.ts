import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Long simulations live in *.slow.test.ts: `pnpm test:slow` (CI runs them too).
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.slow.test.ts'],
    testTimeout: 120_000,
  },
});
