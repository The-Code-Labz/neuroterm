export default function SkeletonRow(): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-edge-subtle last:border-b-0 animate-pulse">
      <div className="w-8 h-8 rounded-md bg-surface2" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3.5 w-40 rounded bg-surface2" />
        <div className="h-3 w-56 rounded bg-surface2/70" />
      </div>
      <div className="w-20 h-8 rounded-md bg-surface2" />
    </div>
  );
}

export function SkeletonRows({ count = 4 }: { count?: number }): JSX.Element {
  return (
    <div role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
