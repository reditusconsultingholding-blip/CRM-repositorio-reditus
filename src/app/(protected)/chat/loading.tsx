import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <Skeleton className="mb-3 h-8 w-40" />
      <Skeleton className="flex-1 w-full" />
    </div>
  );
}
