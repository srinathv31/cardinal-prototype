"use client";

import {
  Activity,
  Headset,
  LayoutDashboard,
  MessageSquare,
  ScrollText,
  Shield,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ResetControl } from "./reset-control";

const links = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/workflows", label: "Workflow Canvas", icon: Workflow },
  { href: "/runs", label: "Agent Runs", icon: Activity },
  { href: "/ask", label: "Ask", icon: MessageSquare },
  { href: "/servicing", label: "Servicing", icon: Headset },
  { href: "/sentinel", label: "Sentinel", icon: Shield },
  { href: "/events", label: "Event Log", icon: ScrollText },
];

export function ShellNav() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="px-5 py-6">
        <Link href="/" className="block">
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
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
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
