"use client";

// Guards one evidence render against a malformed RenderInstruction throwing
// mid-render — a render must never white-screen the app mid-demo (brief §8).
// Mirrors components/run-view/evidence-pane.tsx's local EvidenceBoundary
// class (kept local there too — React error boundaries must be classes and
// there's no shared home for it yet).

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { humanizeComponentName } from "@/components/run-view/utils";

export class EvidenceErrorBoundary extends Component<
  { label: string; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(caught: unknown) {
    console.error(`AskAssistantParts: renderer threw for "${this.props.label}"`, caught);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>Couldn&apos;t render {humanizeComponentName(this.props.label)} — malformed evidence.</span>
        </div>
      );
    }
    return this.props.children;
  }
}
