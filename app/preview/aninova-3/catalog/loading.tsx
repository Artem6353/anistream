/**
 * B2-A: состояние загрузки каталога.
 *
 * Skeleton повторяет реальную сетку, поэтому при подгрузке контент не «прыгает».
 * Клиентского JS нет: это серверный потоковый fallback.
 *
 * Граница загрузки ставится точечно, а не на весь /preview/aninova-3: как только
 * сегмент начинает стримить оболочку, `notFound()` уже не может вернуть статус 404
 * (ответ ушёл со статусом 200). Для страниц, где 404 — нормальный сценарий
 * (произведение, серия, читалка), границы загрузки нет намеренно.
 */
export default function A3Loading() {
  return (
    <div className="a3-wrap a3-skeleton-page" role="status" aria-live="polite" aria-busy="true">
      <span className="a3-sr">Загружаем данные каталога…</span>
      <div className="a3-skeleton a3-skeleton--hero" />
      <div className="a3-skeleton a3-skeleton--line" />
      <div className="a3-skeleton a3-skeleton--line a3-skeleton--short" />
      <div className="a3-skeleton-grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="a3-skeleton a3-skeleton--card" />
        ))}
      </div>
    </div>
  );
}
