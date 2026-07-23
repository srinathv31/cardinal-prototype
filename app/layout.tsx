import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ShellNav } from "@/components/shell/nav";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-screen">
        <TooltipProvider>
          <ShellNav />
          <main className="flex-1 overflow-x-hidden px-8 py-6">{children}</main>
        </TooltipProvider>
      </body>
    </html>
  );
}
