import { useEffect, useState } from "react";
import type { TimelineSegment } from "@shared/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { Button } from "@renderer/components/ui/button";
import { formatTimeShort } from "@renderer/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segment: TimelineSegment | null;
  onConfirm: (splitAtMs: number) => void;
}

function formatTimeOfDay(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function SplitDialog({ open, onOpenChange, segment, onConfirm }: Props) {
  const [positionPct, setPositionPct] = useState(50);

  useEffect(() => {
    if (open) setPositionPct(50);
  }, [open, segment?.id]);

  if (!segment) return null;

  const duration = segment.end - segment.start;
  const splitAtMs = segment.start + Math.round((positionPct / 100) * duration);
  const firstSeconds = Math.round((splitAtMs - segment.start) / 1000);
  const secondSeconds = Math.round((segment.end - splitAtMs) / 1000);
  const minPct = Math.max(5, (60_000 / duration) * 100);
  const maxPct = 100 - minPct;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Split session</DialogTitle>
          <DialogDescription>
            Pick a time to break{" "}
            <span className="font-medium text-foreground">{segment.title}</span> into two
            parts. Each half keeps the same app and title; neither is assigned to a project
            yet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatTimeOfDay(segment.start)}
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatTimeOfDay(segment.end)}
            </span>
          </div>
          <input
            type="range"
            min={Math.round(minPct)}
            max={Math.round(maxPct)}
            value={positionPct}
            onChange={(e) => setPositionPct(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-border bg-card/50 px-3 py-2">
              <div className="text-muted-foreground">First half</div>
              <div className="font-mono tabular-nums">
                {formatTimeOfDay(segment.start)} – {formatTimeOfDay(splitAtMs)}
              </div>
              <div className="text-muted-foreground">
                {formatTimeShort(Math.max(0, firstSeconds))}
              </div>
            </div>
            <div className="rounded-md border border-border bg-card/50 px-3 py-2">
              <div className="text-muted-foreground">Second half</div>
              <div className="font-mono tabular-nums">
                {formatTimeOfDay(splitAtMs)} – {formatTimeOfDay(segment.end)}
              </div>
              <div className="text-muted-foreground">
                {formatTimeShort(Math.max(0, secondSeconds))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(splitAtMs)}>Split here</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
