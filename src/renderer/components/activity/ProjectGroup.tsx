import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Activity, Project } from "@shared/types";
import { formatTime } from "@renderer/lib/format";
import { cn } from "@renderer/lib/utils";
import { ActivityRow } from "./ActivityRow";

interface Props {
  project: Project | null;
  activities: Activity[];
  projects: Project[];
  defaultOpen?: boolean;
}

export function ProjectGroup({ project, activities, projects, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const total = activities.reduce((sum, a) => sum + a.time, 0);
  const sorted = [...activities].sort((a, b) => b.time - a.time);

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
          {project?.name ?? "Uncategorized"}
        </span>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatTime(total)}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {sorted.length > 0 && (
        <div className="grid-collapse" data-open={open}>
          <div>
            <div className="divide-y divide-border border-t border-border">
              {sorted.map((a) => (
                <ActivityRow
                  key={`${a.app}::${a.title}`}
                  activity={a}
                  project={project}
                  projects={projects}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
