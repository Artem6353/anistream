import type { Title } from '@/lib/types';
import { IconPlay } from '@/components/ui/icons';

/** Трейлер с youtube-nocookie: ленивая загрузка, без cookie-трекинга. */
export function TrailerCard({ title }: { title: Title }) {
  if (!title.trailer) return null;
  return (
    <section className="trailer" aria-label={`Трейлер: ${title.ru}`}>
      <h2 className="section-title">
        <IconPlay size={15} /> Трейлер
      </h2>
      <div className="trailer__frame">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${title.trailer}`}
          title={`Трейлер: ${title.ru}`}
          loading="lazy"
          allow="fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    </section>
  );
}
