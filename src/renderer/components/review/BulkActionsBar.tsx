import { useState } from "react";
import { CheckCircle2, GitMerge, Scissors, X } from "lucide-react";
import type { Project, TimelineSegment } from "@shared/types";
import { Button } from "@renderer/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@renderer/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@renderer/components/ui/command";
import { formatTimeShort } from "@renderer/lib/format";
import { cn } from "@renderer/lib/utils";

interface Props {
  selected: TimelineSegment[];
  projects: Project[];
  onClear: () => void;
  onAssign: (projectId: string) => void;
  onMerge: () => void;
  onSplit: () => void;
}

export function BulkActionsBar({
  selected,
  projects,
  onClear,
  onAssign,
  onMerge,
  onSplit,
}: Props) {
  const [assignOpen, setAssignOpen] = useState(false);

  const totalSeconds = selected.reduce(
    (s, seg) => s + Math.round((seg.end - seg.start) / 1000),
    0,
  );

  const first = selected[0];
  const sameKey =
    selected.length > 1 &&
    first &&
    selected.every(
      (s) =>
        s.app === first.app && s.title === first.title && s.source === first.source,
    );

  const canSplit =
    selected.length === 1 &&
    first &&
    first.end - first.start > 2 * 60 * 1000 &&
    first.source !== "calendar";

  return (
    <div className="pointer-events-auto fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
      <span className="pl-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{selected.length}</span> selected ·{" "}
        <span className="font-mono tabular-nums">{formatTimeShort(totalSeconds)}</span>
      </span>

      <Popover open={assignOpen} onOpenChange={setAssignOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="default">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Assign…
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <Command>
            <CommandInput placeholder="Assign to project…" />
            <CommandList>
              <CommandEmpty>No projects found.</CommandEmpty>
              <CommandGroup>
                {projects.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.name}
                    onSelect={() => {
                      onAssign(p.id);
                      setAssignOpen(false);
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="truncate">{p.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Button
        size="sm"
        variant="outline"
        onClick={onMerge}
        disabled={!sameKey}
        className={cn(!sameKey && "opacity-50")}
        title={
          selected.length < 2
            ? "Select two or more segments"
            : sameKey
              ? "Merge into one session"
              : "Selections must share the same app + title"
        }
      >
        <GitMerge className="h-3.5 w-3.5" />
        Merge
      </Button>

      <Button
        size="sm"
        variant="outline"
        onClick={onSplit}
        disabled={!canSplit}
        className={cn(!canSplit && "opacity-50")}
        title={
          selected.length !== 1
            ? "Select exactly one segment"
            : first && first.source === "calendar"
              ? "Calendar segments can't be split"
              : first && first.end - first.start <= 2 * 60 * 1000
                ? "Segment too short to split"
                : "Split the segment at a chosen time"
        }
      >
        <Scissors className="h-3.5 w-3.5" />
        Split
      </Button>

      <button
        onClick={onClear}
        className="ml-1 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Clear selection"
        title="Clear selection"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
