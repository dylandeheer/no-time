import { useEffect, useState } from "react";
import { Download, FolderOpen, Trash2 } from "lucide-react";
import type { AppSettings, DateRange } from "@shared/types";
import { Card } from "@renderer/components/ui/card";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Switch } from "@renderer/components/ui/switch";
import { Separator } from "@renderer/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@renderer/components/ui/alert-dialog";
import { DateRangeSelector } from "@renderer/components/DateRangeSelector";
import { toast } from "sonner";

const INTERVAL_OPTIONS = [
  { value: "1000", label: "1 second" },
  { value: "2000", label: "2 seconds" },
  { value: "5000", label: "5 seconds" },
  { value: "10000", label: "10 seconds" },
];

export function SettingsView() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [exportRange, setExportRange] = useState<DateRange>("today");
  const [clearDialog, setClearDialog] = useState<"today" | "all" | null>(null);
  const [dataDir, setDataDir] = useState("");
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings);
    window.electronAPI.getDataDirectory().then(setDataDir);
    window.electronAPI.getAppVersion().then(setAppVersion);
  }, []);

  const updateSettings = async (partial: Partial<AppSettings>) => {
    const updated = await window.electronAPI.updateSettings(partial);
    setSettings(updated);
  };

  const handleExport = async (format: "csv" | "json") => {
    const result = await window.electronAPI.exportData(format, exportRange);
    if (result.success) {
      toast.success(`Exported to ${result.filePath}`);
    }
  };

  const handleClear = async (scope: "today" | "all") => {
    if (scope === "today") {
      await window.electronAPI.clearTodayData();
      toast.success("Today's data cleared");
    } else {
      await window.electronAPI.clearAllData();
      toast.success("All data cleared");
    }
    setClearDialog(null);
  };

  if (!settings) return null;

  return (
    <div className="p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize how No Time tracks and displays your activity.
        </p>
      </header>

      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Tracking</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            How often the app polls for the active window.
          </p>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Polling interval</span>
            <Select
              value={String(settings.trackingIntervalMs)}
              onValueChange={(v) => updateSettings({ trackingIntervalMs: Number(v) })}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Idle Detection</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Pause tracking when no window activity is detected.
          </p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Enable idle detection</span>
              <Switch
                checked={settings.idle.enabled}
                onCheckedChange={(enabled) =>
                  updateSettings({ idle: { ...settings.idle, enabled } })
                }
              />
            </div>
            {settings.idle.enabled && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Timeout</span>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.idle.timeoutMinutes}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (val >= 1 && val <= 60) {
                      updateSettings({ idle: { ...settings.idle, timeoutMinutes: val } });
                    }
                  }}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Data Export</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Export your tracked activities as CSV or JSON.
          </p>
          <div className="flex items-center gap-3">
            <DateRangeSelector value={exportRange} onChange={setExportRange} />
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("json")}>
              <Download className="h-3.5 w-3.5" />
              JSON
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Data Management</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Clear tracked activity data. This cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => setClearDialog("today")}>
              <Trash2 className="h-3.5 w-3.5" />
              Clear today
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setClearDialog("all")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all data
            </Button>
          </div>
        </Card>

        <Separator />

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">About</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono text-xs">{appVersion || "dev"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Data directory</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto gap-1.5 px-2 py-1 font-mono text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(dataDir);
                  toast.success("Path copied");
                }}
              >
                <FolderOpen className="h-3 w-3" />
                {dataDir.split("/").slice(-2).join("/")}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Theme</span>
              <span className="text-xs">Dark</span>
            </div>
          </div>
        </Card>
      </div>

      <AlertDialog open={clearDialog !== null} onOpenChange={() => setClearDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {clearDialog === "all" ? "Clear all data?" : "Clear today's data?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {clearDialog === "all"
                ? "This will permanently delete all tracked activity across all days. This cannot be undone."
                : "This will permanently delete all activity tracked today. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => clearDialog && handleClear(clearDialog)}
            >
              {clearDialog === "all" ? "Clear all" : "Clear today"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
