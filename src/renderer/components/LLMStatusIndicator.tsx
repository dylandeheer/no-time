import { useEffect, useState } from "react";
import { AlertTriangle, CircleOff, Loader2, Sparkles } from "lucide-react";
import type { LlmState } from "@shared/types";
import { cn } from "@renderer/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";

export function LLMStatusIndicator() {
  const [state, setState] = useState<LlmState>({ status: "disabled", modelId: null });

  useEffect(() => {
    window.electronAPI.llmState().then(setState);
    return window.electronAPI.onLlmState(setState);
  }, []);

  const preset = visualFor(state);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            preset.tone,
          )}
        >
          {preset.icon}
          <span className="flex-1 truncate">{preset.label}</span>
          {preset.pulse && (
            <span
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-current"
              aria-hidden
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        {preset.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

interface Visual {
  icon: React.ReactNode;
  label: string;
  tone: string;
  tooltip: string;
  pulse: boolean;
}

function visualFor(state: LlmState): Visual {
  switch (state.status) {
    case "ready":
      return {
        icon: <Sparkles className="h-3.5 w-3.5" />,
        label: "AI ready",
        tone: "bg-primary/5 text-primary",
        tooltip: `${state.modelId ?? "Model"} loaded locally. Suggestions run on-device.`,
        pulse: false,
      };
    case "loading":
      return {
        icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
        label: "Loading model",
        tone: "bg-sky-500/10 text-sky-400",
        tooltip: "Loading the local LLM into memory. This happens once per session.",
        pulse: true,
      };
    case "downloading":
      return {
        icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
        label: "Downloading model",
        tone: "bg-sky-500/10 text-sky-400",
        tooltip: "Downloading the model from Hugging Face. First run only.",
        pulse: true,
      };
    case "error":
      return {
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        label: "AI error",
        tone: "bg-destructive/10 text-destructive",
        tooltip: state.message ?? "Unknown LLM error. Check Settings.",
        pulse: false,
      };
    case "unavailable":
      return {
        icon: <CircleOff className="h-3.5 w-3.5" />,
        label: "AI not installed",
        tone: "text-muted-foreground/70",
        tooltip:
          state.message ?? "LLM sidecar not installed. Run `npm run build:sidecars`.",
        pulse: false,
      };
    case "disabled":
    default:
      return {
        icon: <Sparkles className="h-3.5 w-3.5" />,
        label: "AI off",
        tone: "text-muted-foreground/70",
        tooltip: "Smart suggestions are disabled. Enable them in Settings.",
        pulse: false,
      };
  }
}
