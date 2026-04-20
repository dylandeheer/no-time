import { Pencil } from "lucide-react";
import type { DayReviewEntry, Project } from "@shared/types";
import { formatTime } from "@renderer/lib/format";
import { AssignmentDropdown } from "@renderer/components/activity/AssignmentDropdown";

interface Props {
  entry: DayReviewEntry;
  project: Project | null;
  projects: Project[];
  onEditManual?: (manualEntryId: string) => void;
}

export function ReviewEntryRow({ entry, project, projects, onEditManual }: Props) {
  const isManual = entry.kind === "manual";

  return (
    <div className="flex items-center gap-4 px-5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm">{entry.title}</span>
          {isManual && (
            <span
              className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary"
              title="Manually added"
            >
              Manual
            </span>
          )}
          {!isManual && entry.assignedBy === "manual" && (
            <span
              className="text-[9px] font-medium uppercase tracking-wider text-primary"
              title="Manually assigned"
            >
              Pinned
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {isManual ? "Manual entry" : entry.app}
        </div>
      </div>
      <div className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
        {formatTime(entry.seconds)}
      </div>
      <div className="shrink-0">
        {isManual && entry.manualEntryId ? (
          <button
            onClick={() => onEditManual?.(entry.manualEntryId!)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
            title="Edit"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        ) : (
          <AssignmentDropdown
            activity={{
              app: entry.app,
              title: entry.title,
              time: entry.seconds,
              projectId: entry.projectId,
              assignedBy: entry.assignedBy,
            }}
            project={project}
            projects={projects}
          />
        )}
      </div>
    </div>
  );
}
