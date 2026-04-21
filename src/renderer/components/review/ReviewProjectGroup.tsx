import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DayReviewEntry, Project, Rule } from "@shared/types";
import { formatTime } from "@renderer/lib/format";
import { cn } from "@renderer/lib/utils";
import { ReviewEntryRow } from "./ReviewEntryRow";

interface Props {
  project: Project | null;
  entries: DayReviewEntry[];
  projects: Project[];
  rules?: Rule[];
  totalSeconds: number;
  defaultOpen?: boolean;
  onEditManual?: (manualEntryId: string) => void;
}

export function ReviewProjectGroup({
  project,
  entries,
  projects,
  rules,
  totalSeconds,
  defaultOpen = true,
  onEditManual,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-accent/50"
      >
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            !project && "border border-muted-foreground bg-transparent",
          )}
          style={project ? { backgroundColor: project.color } : undefined}
          aria-hidden
        />
        <span className="flex-1 text-sm font-semibold tracking-tight">
          {project?.name ?? "Unassigned"}
        </span>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatTime(totalSeconds)}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {entries.length > 0 && (
        <div className="grid-collapse" data-open={open}>
          <div>
            <div className="divide-y divide-border border-t border-border">
              {entries.map((entry) => (
                <ReviewEntryRow
                  key={entry.key}
                  entry={entry}
                  project={project}
                  projects={projects}
                  rules={rules}
                  onEditManual={onEditManual}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
