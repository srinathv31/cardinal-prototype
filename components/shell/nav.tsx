"use client";

import { ClipboardCheck, Headset, ScrollText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ResetControl } from "./reset-control";

// live-llm cleanup (LIVE_LLM_PLAN.md Phase A): the demo-aug4 "parked" nav
// entries (Command Center, Workflow Canvas, Agent Runs, Ask, Sentinel) pointed
// at routes that are now deleted, so both the entries and the parked-render
// branch that dimmed them are gone. Only the three demo-phase routes remain.
const links = [
  // DEMO_THESIS.md use case 1's surface (branch `demo-aug4`) — the ops chat.
  { href: "/ops", label: "Ops", icon: ClipboardCheck },
  { href: "/servicing", label: "Servicing", icon: Headset },
  { href: "/events", label: "Event Log", icon: ScrollText },
];

export function ShellNav() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="px-5 py-6">
        {/* Brand goes to /ops — the demo's entry point (demo-aug4). */}
        <Link href="/ops" className="block">
          <span className="text-lg font-semibold tracking-widest text-sidebar-foreground">
            CARDINAL
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Credit Card Agent Command Center
          </span>
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-5 py-4">
        <span className="text-xs text-muted-foreground">
          Prototype · agents act, humans approve
        </span>
        <ResetControl />
      </div>
    </aside>
  );
}
