// Resolves the `@/*` path alias (tsconfig.json) for vitest, which — unlike
// Next's own bundler — doesn't read tsconfig `paths` automatically. Every
// source file under lib/ imports via `@/...` per project convention (see
// CLAUDE.md: "import from '@/lib/soe'"), so tests need this to run at all.

import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Keep the default excludes, plus Claude Code session artifacts —
    // nested git worktrees under .claude/ carry their own copies of the
    // test files, which would otherwise run against this checkout's lib/.
    exclude: ['**/node_modules/**', '**/.next/**', '**/.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
