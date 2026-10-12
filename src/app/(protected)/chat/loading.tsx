import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-[calc(100dvh-3rem-var(--app-bar,0px))] flex-col">
      <Skeleton className="mb-3 h-8 w-40" />
      <Skeleton className="flex-1 w-full" />
    </div>
  );
}
