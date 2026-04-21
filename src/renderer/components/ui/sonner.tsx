import { Toaster as SonnerToaster, toast } from "sonner";

const Toaster = (props: React.ComponentProps<typeof SonnerToaster>) => (
  <SonnerToaster
    theme="dark"
    className="toaster group"
    style={{ ["--width" as string]: "420px" } as React.CSSProperties}
    toastOptions={{
      classNames: {
        toast:
          "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-lg",
        title: "truncate !block min-w-0",
        description: "group-[.toast]:text-muted-foreground truncate !block min-w-0",
        actionButton:
          "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground !whitespace-nowrap !max-w-[220px] !overflow-hidden !text-ellipsis !shrink-0",
        cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
      },
    }}
    {...props}
  />
);

export { Toaster, toast };
