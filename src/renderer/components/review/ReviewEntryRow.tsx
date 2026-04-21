import { CalendarDays, Pencil } from "lucide-react";
import type { DayReviewEntry, Project } from "@shared/types";
import { formatTime } from "@renderer/lib/format";
import { AssignmentDropdown } from "@renderer/components/activity/AssignmentDropdown";
import { SuggestionChip } from "./SuggestionChip";

interface Props {
  entry: DayReviewEntry;
  project: Project | null;
  projects: Project[];
  onEditManual?: (manualEntryId: string) => void;
}

function formatEventTimeRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const fmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
    return `${fmt.format(s)} – ${fmt.format(e)}`;
  } catch {
    return "";
  }
}

export function ReviewEntryRow({ entry, project, projects, onEditManual }: Props) {
  const isManual = entry.kind === "manual";
  const isCalendar = entry.kind === "calendar";

  return (
    <div className="flex items-center gap-4 px-5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isCalendar && (
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm">{entry.title}</span>
          {isManual && (
            <span
              className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary"
              title="Manually added"
            >
              Manual
            </span>
          )}
          {isCalendar && (
            <span
              className="rounded-sm bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-sky-400"
              title="From Calendar"
            >
              Meeting
            </span>
          )}
          {!isManual && !isCalendar && entry.assignedBy === "manual" && (
            <span
              className="text-[9px] font-medium uppercase tracking-wider text-primary"
              title="Manually assigned"
            >
              Pinned
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {isManual && "Manual entry"}
          {isCalendar &&
            entry.calendarEvent &&
            `${entry.calendarEvent.calendarTitle} · ${formatEventTimeRange(
              entry.calendarEvent.start,
              entry.calendarEvent.end,
            )}`}
          {!isManual && !isCalendar && entry.app}
        </div>
      </div>
      <div className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
        {formatTime(entry.seconds)}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {entry.suggestion && !entry.projectId && (
          <SuggestionChip
            suggestion={entry.suggestion}
            project={projects.find((p) => p.id === entry.suggestion!.projectId)}
          />
        )}
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
              key: entry.key,
              app: entry.app,
              title: entry.title,
              time: entry.seconds,
              projectId: entry.projectId,
              assignedBy: entry.assignedBy,
            }}
            project={project}
            projects={projects}
            activityKey={entry.key}
          />
        )}
      </div>
    </div>
  );
}
