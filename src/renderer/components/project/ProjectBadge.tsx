import type { Project } from "@shared/types";
import { cn } from "@renderer/lib/utils";

export function ProjectBadge({
  project,
  className,
}: {
  project: Project | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs",
        className,
      )}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: project?.color ?? "#52525b" }}
        aria-hidden
      />
      <span className="max-w-[12rem] truncate font-medium">
        {project?.name ?? "Uncategorized"}
      </span>
    </div>
  );
}
