export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/** Repeats a skeleton block — used while product/order lists load. */
export function SkeletonList({ count, className = 'h-24' }: { count: number; className?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton className={className} key={index} />
      ))}
    </div>
  );
}
