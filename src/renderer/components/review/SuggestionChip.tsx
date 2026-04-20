import { Check, Sparkles, X } from "lucide-react";
import type { Project, Suggestion } from "@shared/types";
import { cn } from "@renderer/lib/utils";
import { toast } from "sonner";

interface Props {
  suggestion: Suggestion;
  project: Project | undefined;
}

export function SuggestionChip({ suggestion, project }: Props) {
  if (!project) return null;

  const accept = async () => {
    try {
      await window.electronAPI.acceptSuggestion(suggestion.activityKey);
      toast.success(`Assigned to "${project.name}"`);
    } catch {
      toast.error("Failed to accept suggestion");
    }
  };

  const dismiss = async () => {
    try {
      await window.electronAPI.dismissSuggestion(suggestion.activityKey);
    } catch {
      toast.error("Failed to dismiss");
    }
  };

  const confidence = Math.round(suggestion.confidence * 100);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-dashed px-1.5 py-0.5 text-xs",
      )}
      style={{
        borderColor: project.color,
        color: project.color,
        backgroundColor: `${project.color}14`,
      }}
      title={suggestion.reason || "Smart suggestion"}
    >
      <Sparkles className="h-3 w-3" />
      <span className="max-w-[8rem] truncate font-medium">{project.name}</span>
      <span className="text-[10px] opacity-70">{confidence}%</span>
      <button
        onClick={accept}
        className="ml-0.5 rounded-full bg-background/60 p-0.5 hover:bg-background"
        aria-label="Accept suggestion"
        title="Accept"
      >
        <Check className="h-3 w-3" />
      </button>
      <button
        onClick={dismiss}
        className="rounded-full bg-background/60 p-0.5 hover:bg-background"
        aria-label="Dismiss suggestion"
        title="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
