import { useEffect, useState } from "react";
import { AlertTriangle, Check, RefreshCw, Sparkles } from "lucide-react";
import type { AppSettings, LlmState } from "@shared/types";
import { Card } from "@renderer/components/ui/card";
import { Button } from "@renderer/components/ui/button";
import { Switch } from "@renderer/components/ui/switch";
import { cn } from "@renderer/lib/utils";
import { toast } from "sonner";

interface Props {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => Promise<void>;
}

function statusLabel(state: LlmState): {
  tone: "ok" | "warn" | "error" | "info";
  text: string;
} {
  switch (state.status) {
    case "ready":
      return { tone: "ok", text: `Ready — ${state.modelId ?? "model loaded"}` };
    case "loading":
      return { tone: "info", text: "Loading model…" };
    case "downloading":
      return { tone: "info", text: "Downloading model (one-time, ~400 MB)…" };
    case "error":
      return { tone: "error", text: state.message ?? "LLM error" };
    case "unavailable":
      return {
        tone: "error",
        text: state.message ?? "LLM sidecar not built. Run `npm run build:sidecars`.",
      };
    case "disabled":
      return { tone: "warn", text: "Off" };
    default:
      return { tone: "warn", text: "Unknown" };
  }
}

export function SuggestionsSettingsCard({ settings, onUpdate }: Props) {
  const { suggestions } = settings;
  const [state, setState] = useState<LlmState>({ status: "disabled", modelId: null });

  useEffect(() => {
    window.electronAPI.llmState().then(setState);
    return window.electronAPI.onLlmState(setState);
  }, []);

  const toggleEnabled = async (enabled: boolean) => {
    await onUpdate({ suggestions: { ...suggestions, enabled } });
  };

  const restart = async () => {
    try {
      await window.electronAPI.llmRestart();
      toast.success("Restarting LLM sidecar");
    } catch {
      toast.error("Failed to restart");
    }
  };

  const runSweep = async () => {
    try {
      await window.electronAPI.runSuggestionSweep();
      toast.success("Running suggestions…");
    } catch {
      toast.error("Failed to run");
    }
  };

  const clearDismissed = async () => {
    try {
      await window.electronAPI.clearDismissedSuggestions();
      toast.success("Dismissed suggestions cleared");
    } catch {
      toast.error("Failed");
    }
  };

  const label = statusLabel(state);

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Smart suggestions</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Local LLM proposes project assignments for unlabeled activities. Model runs on-device via
        MLX — nothing leaves your Mac. Suggestions are advisory, not auto-applied.
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm">Enable smart suggestions</span>
          <Switch
            checked={suggestions.enabled}
            onCheckedChange={toggleEnabled}
            disabled={state.status === "unavailable"}
          />
        </div>

        <div
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
            label.tone === "ok" && "border-primary/30 bg-primary/5 text-primary",
            label.tone === "info" && "border-sky-500/30 bg-sky-500/5 text-sky-400",
            label.tone === "warn" && "border-amber-500/30 bg-amber-500/5 text-amber-400",
            label.tone === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
          )}
        >
          {label.tone === "ok" ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span className="flex-1">{label.text}</span>
        </div>

        {suggestions.enabled && state.status !== "unavailable" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={runSweep} disabled={state.status !== "ready"}>
              <RefreshCw className="h-3 w-3" />
              Run now
            </Button>
            <Button variant="outline" size="sm" onClick={restart}>
              <RefreshCw className="h-3 w-3" />
              Restart model
            </Button>
            <Button variant="outline" size="sm" onClick={clearDismissed}>
              Reset dismissed
            </Button>
          </div>
        )}

        <div className="text-[11px] text-muted-foreground">
          Model: <span className="font-mono">{suggestions.modelId}</span>
        </div>
      </div>
    </Card>
  );
}
