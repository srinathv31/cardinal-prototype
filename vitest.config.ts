// Resolves the `@/*` path alias (tsconfig.json) for vitest, which — unlike
// Next's own bundler — doesn't read tsconfig `paths` automatically. Every
// source file under lib/ imports via `@/...` per project convention (see
// CLAUDE.md: "import from '@/lib/soe'"), so tests need this to run at all.

import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
