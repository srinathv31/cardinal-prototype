"use client";

// Last-resort boundary for crashes in the root layout itself (brief §8.4).
// Unlike every other error.tsx here, this one replaces app/layout.tsx
// entirely while active, so it must render its own <html>/<body>
// (node_modules/next/dist/docs/.../file-conventions/error.md, "Global
// Error") and can't assume globals.css, fonts, or the ShellNav loaded —
// hence inline styles and no imports from the rest of the app. A plain full
// reload is the most robust recovery here: the failure mode this file
// exists for is the root layout itself, so re-rendering in place (reset())
// is less trustworthy than a fresh document load.

import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          backgroundColor: "#0b0d12",
          color: "#e7e9ee",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            padding: 32,
            textAlign: "center",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            backgroundColor: "#12151c",
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600 }}>
            Cardinal hit an error — the demo is still running.
          </h1>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: 14,
              lineHeight: 1.5,
              color: "#a2a8b5",
            }}
          >
            Reload to pick back up from the opening state.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              color: "#0b0d12",
              backgroundColor: "#e7e9ee",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
