export function RailSkeleton() {
  return (
    <div className="page-section" aria-busy="true" aria-label="Загрузка">
      <div className="skeleton-rail">
        {Array.from({ length: 8 }, (_, i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
      <div className="skeleton-rail">
        {Array.from({ length: 8 }, (_, i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
    </div>
  );
}
