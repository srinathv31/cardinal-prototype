// Kind/Actor pill renderers for the Event Log table (W3.2). Plain spans
// rather than components/ui/badge.tsx's Badge — that primitive's variant
// set (default/secondary/destructive/outline/ghost/link) doesn't cover the
// success/warning/primary/muted tone vocabulary this screen needs; same
// border/bg/text pattern components/run-view uses for its own tone chips
// (read for convention, not imported).

import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EventLogEntry } from '@/lib/events/types';
import { actorTone, kindTone, TONE_CLASSES } from './utils';

export function KindBadge({ kind }: { kind: EventLogEntry['kind'] }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        TONE_CLASSES[kindTone(kind)],
      )}
    >
      {kind}
    </span>
  );
}

export function ActorBadge({ actor }: { actor: EventLogEntry['actor'] }) {
  const Icon = actor === 'human' ? User : Bot;
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold capitalize',
        TONE_CLASSES[actorTone(actor)],
      )}
    >
      <Icon className="size-3" />
      {actor}
    </span>
  );
}
