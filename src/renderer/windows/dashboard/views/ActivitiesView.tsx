import { useMemo, useRef } from "react";
import type { Activity, Project, TrackingState } from "@shared/types";
import { ProjectGroup } from "@renderer/components/activity/ProjectGroup";
import { UncategorizedBanner } from "@renderer/components/activity/UncategorizedBanner";

interface Props {
  state: TrackingState;
}

export function ActivitiesView({ state }: Props) {
  const uncategorizedRef = useRef<HTMLDivElement>(null);

  const { groups, unassigned } = useMemo(() => {
    const byProject = new Map<string, Activity[]>();
    const unassignedList: Activity[] = [];

    for (const activity of Object.values(state.activities)) {
      if (activity.projectId === null) {
        unassignedList.push(activity);
      } else {
        const list = byProject.get(activity.projectId) ?? [];
        list.push(activity);
        byProject.set(activity.projectId, list);
      }
    }

    const groups: Array<{ project: Project; activities: Activity[] }> = [];
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
  }, [state.activities, state.projects]);

  const scrollToUncategorized = () => {
    uncategorizedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const hasContent = groups.length > 0 || unassigned.length > 0;

  return (
    <div className="p-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Activities</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All tracked activities today, grouped by project.
        </p>
      </header>

      <UncategorizedBanner count={unassigned.length} onReview={scrollToUncategorized} />

      {!hasContent ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <h3 className="text-base font-medium">No activity yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Start using apps and tracking will begin automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <ProjectGroup
              key={g.project.id}
              project={g.project}
              activities={g.activities}
              projects={state.projects}
            />
          ))}

          {unassigned.length > 0 && (
            <div ref={uncategorizedRef}>
              <ProjectGroup project={null} activities={unassigned} projects={state.projects} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
