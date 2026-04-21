import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import type { LlmActivity, LlmState } from "@shared/types";
import { cn } from "@renderer/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";

interface Props {
  onJumpToReview?: () => void;
}

export function LLMStatusIndicator({ onJumpToReview }: Props) {
  const [state, setState] = useState<LlmState>({ status: "disabled", modelId: null });
  const [activity, setActivity] = useState<LlmActivity>({ running: false, pendingCount: 0 });

  useEffect(() => {
    window.electronAPI.llmState().then(setState);
    window.electronAPI.getLlmActivity().then(setActivity);
    const offState = window.electronAPI.onLlmState(setState);
    const offActivity = window.electronAPI.onLlmActivity(setActivity);
    return () => {
      offState();
      offActivity();
    };
  }, []);

  const mode = pickMode(state, activity);
  if (!mode) return null;

  const content = (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        mode.tone,
        mode.clickable && "cursor-pointer hover:brightness-110",
      )}
      onClick={mode.clickable && onJumpToReview ? onJumpToReview : undefined}
      role={mode.clickable ? "button" : undefined}
    >
      {mode.icon}
      <span className="flex-1 truncate">{mode.label}</span>
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        {mode.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

interface Mode {
  icon: React.ReactNode;
  label: string;
  tone: string;
  tooltip: string;
  clickable: boolean;
}

function pickMode(state: LlmState, activity: LlmActivity): Mode | null {
  if (state.status === "error") {
    return {
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: "AI error",
      tone: "bg-destructive/10 text-destructive",
      tooltip: state.message ?? "LLM sidecar reported an error. Check Settings.",
      clickable: false,
    };
  }

  if (state.status === "downloading") {
    return {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      label: "Downloading model",
      tone: "bg-sky-500/10 text-sky-400",
      tooltip: "One-time download of the on-device model from Hugging Face.",
      clickable: false,
    };
  }

  if (state.status === "loading" || activity.running) {
    return {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      label: "AI thinking…",
      tone: "bg-sky-500/10 text-sky-400",
      tooltip: "Running suggestions on your recent uncategorized activities.",
      clickable: false,
    };
  }

  if (activity.pendingCount > 0) {
    return {
      icon: <Sparkles className="h-3.5 w-3.5" />,
      label: `${activity.pendingCount} suggestion${activity.pendingCount === 1 ? "" : "s"}`,
      tone: "bg-primary/10 text-primary",
      tooltip: "Open Review to accept or dismiss the proposed project assignments.",
      clickable: true,
    };
  }

  return null;
}
