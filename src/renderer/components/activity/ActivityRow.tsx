import { CalendarDays } from "lucide-react";
import type { ActivitySummary, Project } from "@shared/types";
import { CALENDAR_APP_NAME, MANUAL_APP_NAME } from "@shared/types";
import { formatTime } from "@renderer/lib/format";
import { AssignmentDropdown } from "./AssignmentDropdown";

interface Props {
  activity: ActivitySummary;
  project: Project | null;
  projects: Project[];
}

export function ActivityRow({ activity, project, projects }: Props) {
  const isCalendar = activity.app === CALENDAR_APP_NAME;
  const isManualEntry = activity.app === MANUAL_APP_NAME;

  return (
    <div className="flex items-center gap-4 px-5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isCalendar && (
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm">{activity.title}</span>
          {isCalendar && (
            <span
              className="rounded-sm bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-sky-400"
              title="From Calendar"
            >
              Meeting
            </span>
          )}
          {isManualEntry && (
            <span
              className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary"
              title="Manually added"
            >
              Manual
            </span>
          )}
          {!isCalendar && !isManualEntry && activity.assignedBy === "manual" && (
            <span
              className="text-[9px] font-medium uppercase tracking-wider text-primary"
              title="Manually assigned"
            >
              Pinned
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">{activity.app}</div>
      </div>
      <div className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
        {formatTime(activity.time)}
      </div>
      <div className="shrink-0">
        <AssignmentDropdown
          activity={activity}
          project={project}
          projects={projects}
          activityKey={activity.key}
        />
      </div>
    </div>
  );
}
