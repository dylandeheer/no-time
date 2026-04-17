import { Card } from "@renderer/components/ui/card";

export function SettingsView() {
  return (
    <div className="p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize how No Time tracks and displays your activity.
        </p>
      </header>

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Theme</h2>
          <p className="text-xs text-muted-foreground">
            Dark mode only (for now). Light mode is coming soon.
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Tracking interval</h2>
          <p className="text-xs text-muted-foreground">
            Currently polls every 1 second. Configurable in a future release.
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Data export</h2>
          <p className="text-xs text-muted-foreground">
            CSV and JSON export coming soon.
          </p>
        </Card>
      </div>
    </div>
  );
}
