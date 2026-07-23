// Next 16 startup hook (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md):
// register() runs once per server instance, before it accepts requests.
// Registers the Event Log telemetry integration (brief §5e) globally, so
// every agent run — regardless of which request handler creates it — feeds
// the same in-memory store, per docs/wire-contract.md §5 ("one AI SDK
// telemetry integration ... wired at app startup via instrumentation.ts").
// Skipped on the edge runtime: the store and the route handlers that read it
// are Node-only.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registerTelemetry } = await import('ai');
  const { eventLogTelemetry } = await import('@/lib/events/telemetry');
  registerTelemetry(eventLogTelemetry);
}
