import { AlertCircle } from "lucide-react";
import { Button } from "@renderer/components/ui/button";

interface Props {
  count: number;
  onReview: () => void;
}

export function UncategorizedBanner({ count, onReview }: Props) {
  if (count === 0) return null;

  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-5 py-3 text-sm">
      <AlertCircle className="h-4 w-4 shrink-0 text-primary" />
      <div className="flex-1">
        <span className="font-medium text-foreground">
          {count} {count === 1 ? "activity" : "activities"} uncategorized
        </span>
        <span className="ml-2 text-muted-foreground">
          Assign them to projects to track time properly.
        </span>
      </div>
      <Button size="sm" variant="secondary" onClick={onReview}>
        Review
      </Button>
    </div>
  );
}
