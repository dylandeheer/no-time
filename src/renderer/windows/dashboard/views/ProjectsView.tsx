import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Activity, TrackingState, DateRange, HistoricalState } from "@shared/types";
import { Button } from "@renderer/components/ui/button";
import { ProjectCard } from "@renderer/components/project/ProjectCard";
import { CreateProjectDialog } from "@renderer/components/project/CreateProjectDialog";
import { DateRangeSelector } from "@renderer/components/DateRangeSelector";
import { formatTime } from "@renderer/lib/format";

interface Props {
  state: TrackingState;
  onOpenProject: (id: string) => void;
}

export function ProjectsView({ state, onOpenProject }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [historicalState, setHistoricalState] = useState<HistoricalState | null>(null);

  useEffect(() => {
    if (dateRange === "today") {
      setHistoricalState(null);
      return;
    }
    window.electronAPI.getHistoricalState(dateRange).then(setHistoricalState);
  }, [dateRange]);

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

  const rangeTimeByProject = useMemo(() => {
    if (!historicalState) return null;
    const map = new Map<string, number>();
    for (const a of Object.values(historicalState.activities)) {
      const key = a.projectId ?? "__unassigned__";
      map.set(key, (map.get(key) ?? 0) + a.totalTime);
    }
    return map;
  }, [historicalState]);

  const unassigned = activitiesByProject.get("__unassigned__") ?? [];
  const unassignedTime = unassigned.reduce((sum, a) => sum + a.time, 0);
  const usedColors = state.projects.map((p) => p.color);

  const rangeLabel =
    dateRange === "week" ? "This week" :
    dateRange === "month" ? "This month" :
    dateRange === "all" ? "All time" : null;

  return (
    <div className="p-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Activities are automatically grouped into projects based on rules.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangeSelector value={dateRange} onChange={setDateRange} />
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New project
          </Button>
        </div>
      </header>

      {state.projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12">
          <h3 className="text-center text-base font-medium">Get started with No Time</h3>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Follow these steps to organize your tracked activities.
          </p>

          <div className="mx-auto mt-6 max-w-md space-y-4">
            {[
              { step: 1, title: "Tracking starts automatically", desc: "No Time detects which app and window you're using in the background." },
              { step: 2, title: "Check your activities", desc: "Switch to the Activities tab to see everything being tracked." },
              { step: 3, title: "Create a project", desc: "Group related activities under a project for easier tracking." },
              { step: 4, title: "Add rules to auto-group", desc: "Set rules to automatically assign activities by app name or title pattern." },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold">
                  {item.step}
                </span>
                <div>
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-center">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create your first project
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {state.projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              rules={state.rules}
              activities={activitiesByProject.get(project.id) ?? []}
              rangeTime={rangeTimeByProject?.get(project.id)}
              rangeLabel={rangeLabel ?? undefined}
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
