export default function PreviewSearchLoading() {
  return (
    <div className="a3-wrap a3-skeleton-page" aria-busy="true" aria-label="Загрузка результатов поиска">
      <div className="a3-skeleton a3-skeleton--line a3-skeleton--short" />
      <div className="a3-skeleton a3-skeleton--line" />
      <div className="a3-skeleton a3-skeleton--hero" />
      <div className="a3-skeleton-grid">
        {Array.from({ length: 8 }).map((_, i) => <div className="a3-skeleton a3-skeleton--card" key={i} />)}
      </div>
    </div>
  );
}
