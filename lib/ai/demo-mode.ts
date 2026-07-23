// Demo-mode switch (brief §8.1 / CLAUDE.md standing rule). `scripted` (the
// default) drives every model call through the deterministic scripted model
// (lib/ai/scripted/), so all four agents complete full runs with no API key
// and no network. `live` bypasses all of that and restores the pre-W4.1
// behavior (lib/ai/provider.ts's getLanguageModel() called directly).
//
// Read once per call, not cached — env vars don't change mid-process in this
// app, but re-reading keeps this trivially test-friendly (tests set
// process.env.DEMO_MODE per-case without needing a reset hook).

export type DemoMode = 'scripted' | 'live';

export function demoMode(): DemoMode {
  const raw = process.env.DEMO_MODE ?? 'scripted';
  if (raw === 'scripted' || raw === 'live') return raw;
  throw new Error(`Unknown DEMO_MODE "${raw}" — expected "scripted" or "live".`);
}
