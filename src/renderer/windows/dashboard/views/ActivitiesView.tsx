import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivitySummary, Project, TrackingState, DateRange, HistoricalState } from "@shared/types";
import { ProjectGroup } from "@renderer/components/activity/ProjectGroup";
import { UncategorizedBanner } from "@renderer/components/activity/UncategorizedBanner";
import { DateRangeSelector } from "@renderer/components/DateRangeSelector";

interface Props {
  state: TrackingState;
}

export function ActivitiesView({ state }: Props) {
  const uncategorizedRef = useRef<HTMLDivElement>(null);
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [historicalState, setHistoricalState] = useState<HistoricalState | null>(null);

  useEffect(() => {
    if (dateRange === "today") {
      setHistoricalState(null);
      return;
    }
    window.electronAPI.getHistoricalState(dateRange).then(setHistoricalState);
  }, [dateRange]);

  const normalized: ActivitySummary[] = useMemo(() => {
    if (dateRange === "today") {
      return Object.values(state.activities).map((a) => ({
        app: a.app,
        title: a.title,
        time: a.time,
        projectId: a.projectId,
        assignedBy: a.assignedBy,
      }));
    }
    if (!historicalState) return [];
    return Object.values(historicalState.activities).map((a) => ({
      app: a.app,
      title: a.title,
      time: a.totalTime,
      projectId: a.projectId,
      assignedBy: a.assignedBy,
    }));
  }, [dateRange, state.activities, historicalState]);

  const { groups, unassigned } = useMemo(() => {
    const byProject = new Map<string, ActivitySummary[]>();
    const unassignedList: ActivitySummary[] = [];

    for (const activity of normalized) {
      if (activity.projectId === null) {
        unassignedList.push(activity);
      } else {
        const list = byProject.get(activity.projectId) ?? [];
        list.push(activity);
        byProject.set(activity.projectId, list);
      }
    }

    const groups: Array<{ project: Project; activities: ActivitySummary[] }> = [];
    for (const project of state.projects) {
      const list = byProject.get(project.id);
      if (list && list.length > 0) {
        groups.push({ project, activities: list });
      }
    }
    groups.sort((a, b) => {
      const ta = a.activities.reduce((s, x) => s + x.time, 0);
      const tb = b.activities.reduce((s, x) => s + x.time, 0);
      return tb - ta;
    });

    return { groups, unassigned: unassignedList };
  }, [normalized, state.projects]);

  const scrollToUncategorized = () => {
    uncategorizedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const hasContent = groups.length > 0 || unassigned.length > 0;

  const rangeLabel =
    dateRange === "today" ? "today" :
    dateRange === "week" ? "this week" :
    dateRange === "month" ? "this month" : "all time";

  return (
    <div className="p-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All tracked activities {rangeLabel}, grouped by project.
          </p>
        </div>
        <DateRangeSelector value={dateRange} onChange={setDateRange} />
      </header>

      <UncategorizedBanner count={unassigned.length} onReview={scrollToUncategorized} />

      {!hasContent ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <h3 className="text-base font-medium">No activity yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {dateRange === "today"
              ? "Start using apps and tracking will begin automatically."
              : `No tracked activity for ${rangeLabel}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <ProjectGroup
              key={g.project.id}
              project={g.project}
              activities={g.activities }
              projects={state.projects}
            />
          ))}

          {unassigned.length > 0 && (
            <div ref={uncategorizedRef}>
              <ProjectGroup project={null} activities={unassigned } projects={state.projects} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
