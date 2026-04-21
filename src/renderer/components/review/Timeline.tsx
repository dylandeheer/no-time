import { useMemo, useState } from "react";
import type { TimelineSegment } from "@shared/types";
import { cn } from "@renderer/lib/utils";

interface Props {
  segments: TimelineSegment[];
  dayStartMs: number;
  dayEndMs: number;
  selectedIds?: Set<string>;
  onSelect?: (id: string, additive: boolean) => void;
}

const HOUR_STOPS = [0, 6, 9, 12, 15, 18, 21];

export function Timeline({ segments, dayStartMs, dayEndMs, selectedIds, onSelect }: Props) {
  const duration = dayEndMs - dayStartMs;
  const [hovered, setHovered] = useState<string | null>(null);

  const visibleSegments = useMemo(() => {
    return segments
      .map((s) => {
        const start = Math.max(s.start, dayStartMs);
        const end = Math.min(s.end, dayEndMs);
        if (end <= start) return null;
        return { ...s, start, end };
      })
      .filter((s): s is TimelineSegment => s !== null);
  }, [segments, dayStartMs, dayEndMs]);

  return (
    <div className="space-y-1">
      <div className="relative h-8 overflow-hidden rounded-md border border-border bg-card/50">
        {visibleSegments.map((seg) => {
          const left = ((seg.start - dayStartMs) / duration) * 100;
          const width = ((seg.end - seg.start) / duration) * 100;
          const color = seg.projectColor ?? "#52525b";
          const opacity = seg.source === "idle" ? 0.25 : seg.projectId ? 0.85 : 0.5;
          const isSelected = selectedIds?.has(seg.id);
          const label = `${seg.projectName ?? "Unassigned"} · ${seg.title}`;
          return (
            <button
              key={seg.id}
              onClick={(e) => onSelect?.(seg.id, e.metaKey || e.shiftKey)}
              onMouseEnter={() => setHovered(seg.id)}
              onMouseLeave={() => setHovered((h) => (h === seg.id ? null : h))}
              title={label}
              className={cn(
                "absolute top-0 h-full cursor-pointer transition-all hover:brightness-125",
                isSelected && "ring-2 ring-foreground ring-offset-0",
              )}
              style={{
                left: `${left}%`,
                width: `${Math.max(0.2, width)}%`,
                background: color,
                opacity,
              }}
              aria-label={label}
            />
          );
        })}
        {visibleSegments.length === 0 && (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            Nothing tracked
          </div>
        )}
      </div>
      <div className="relative h-3 text-[9px] text-muted-foreground">
        {HOUR_STOPS.map((h) => (
          <span
            key={h}
            className="absolute -translate-x-1/2 tabular-nums"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {String(h).padStart(2, "0")}
          </span>
        ))}
        <span className="absolute right-0 translate-x-[1px] tabular-nums">24</span>
      </div>
      {hovered && (
        <div className="pt-1 text-[11px] text-muted-foreground">
          {(() => {
            const seg = visibleSegments.find((s) => s.id === hovered);
            if (!seg) return null;
            return (
              <span>
                <span className="font-mono">{formatRange(seg.start, seg.end)}</span> —{" "}
                {seg.projectName ? (
                  <span style={{ color: seg.projectColor ?? undefined }}>{seg.projectName}</span>
                ) : (
                  <span>Unassigned</span>
                )}{" "}
                · {seg.title}
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function formatRange(start: number, end: number): string {
  const fmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${fmt.format(new Date(start))} – ${fmt.format(new Date(end))}`;
}
