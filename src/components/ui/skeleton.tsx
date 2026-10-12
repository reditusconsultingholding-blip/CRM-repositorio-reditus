import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-xl border border-border/60 bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Skeleton };
