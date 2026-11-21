import { Skeleton } from "@/components/ui/states";

/** Shown inside the shell while a page's code loads; mirrors the ledger page shape. */
export default function AppLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading page">
      <div className="space-y-3 border-b-2 border-ink pb-5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-11 w-80 max-w-full" />
        <Skeleton className="h-4 w-[30rem] max-w-full" />
      </div>
      <div className="grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4 [&>div]:bg-surface">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-9 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
