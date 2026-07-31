import type { Metadata } from "next";
import { ShellNav } from "@/components/shell/nav";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Geist/Geist Mono are vendored (public/fonts + app/fonts.css) instead of
// next/font/google: a build-time fetch of fonts.googleapis.com is a network
// dependency the demo must not have. The woff2 slices and @font-face blocks
// (unicode ranges, weight axis, fallback metrics) are byte-for-byte what
// next/font produced; --font-geist-sans/--font-geist-mono now live in
// globals.css.

export const metadata: Metadata = {
  title: "Cardinal — Agent Command Center",
  description:
    "Governed agentic AI over credit card servicing data. Prototype.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="flex min-h-screen">
        <TooltipProvider>
          <ShellNav />
          <main className="flex-1 overflow-x-hidden px-8 py-6">{children}</main>
        </TooltipProvider>
      </body>
    </html>
  );
}
