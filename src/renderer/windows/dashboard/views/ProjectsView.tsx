import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Activity, TrackingState } from "@shared/types";
import { Button } from "@renderer/components/ui/button";
import { ProjectCard } from "@renderer/components/project/ProjectCard";
import { CreateProjectDialog } from "@renderer/components/project/CreateProjectDialog";
import { formatTime } from "@renderer/lib/format";

interface Props {
  state: TrackingState;
  onOpenProject: (id: string) => void;
}

export function ProjectsView({ state, onOpenProject }: Props) {
  const [createOpen, setCreateOpen] = useState(false);

  const activitiesByProject = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const activity of Object.values(state.activities)) {
      const key = activity.projectId ?? "__unassigned__";
      const list = map.get(key) ?? [];
      list.push(activity);
      map.set(key, list);
    }
    return map;
  }, [state.activities]);

  const unassigned = activitiesByProject.get("__unassigned__") ?? [];
  const unassignedTime = unassigned.reduce((sum, a) => sum + a.time, 0);
  const usedColors = state.projects.map((p) => p.color);

  return (
    <div className="p-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Activities are automatically grouped into projects based on rules.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </header>

      {state.projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <h3 className="text-base font-medium">No projects yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first project to automatically group your tracked activities.
          </p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create your first project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {state.projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              rules={state.rules}
              activities={activitiesByProject.get(project.id) ?? []}
              onOpen={() => onOpenProject(project.id)}
            />
          ))}

          {unassigned.length > 0 && (
            <div className="flex flex-col rounded-lg border border-dashed border-border p-5 text-muted-foreground">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border border-muted-foreground" aria-hidden />
                <span className="text-base font-semibold tracking-tight">Uncategorized</span>
              </div>
              <div className="mb-4">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wider">Today</div>
                <div className="font-mono text-2xl font-light tabular-nums">
                  {formatTime(unassignedTime)}
                </div>
              </div>
              <div className="mt-auto text-xs">
                {unassigned.length} {unassigned.length === 1 ? "activity" : "activities"} waiting to
                be grouped
              </div>
            </div>
          )}
        </div>
      )}

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        usedColors={usedColors}
      />
    </div>
  );
}
