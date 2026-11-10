import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig uses `jsx: preserve` (Next compiles it); tests need JSX compiled themselves.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // Never let a test talk to real infrastructure by accident.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/never_connect',
    },
    restoreMocks: true,
    unstubEnvs: true,
  },
});
