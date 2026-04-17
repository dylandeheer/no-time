import type { Activity, Project } from "@shared/types";
import { formatTime } from "@renderer/lib/format";
import { AssignmentDropdown } from "./AssignmentDropdown";

interface Props {
  activity: Activity;
  project: Project | null;
  projects: Project[];
}

export function ActivityRow({ activity, project, projects }: Props) {
  return (
    <div className="flex items-center gap-4 px-5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm">{activity.title}</span>
          {activity.assignedBy === "manual" && (
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
        <AssignmentDropdown activity={activity} project={project} projects={projects} />
      </div>
    </div>
  );
}
