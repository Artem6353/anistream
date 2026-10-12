import type { Title } from '@/lib/types';
import { episodeCount } from '@/lib/episodes';
import { plural } from '@/lib/format';

/**
 * «Где смотреть легально» — расширяемый блок (юридическое замечание ТЗ).
 *
 * Сайт встраивает сторонние озвучки и позиционируется как «смотреть онлайн», что несёт
 * риск жалоб правообладателей, понижения в выдаче и блокировки на хостинге. Ничего
 * в существующем плеере не удаляется, но блок подготовлен так, чтобы его можно было
 * включить одной переменной окружения и наполнять данными по тайтлам.
 *
 * Включение: LEGAL_WATCH_ENABLED=1 (Vercel → Environment Variables).
 * Источники ссылок по приоритету:
 *  1) `title.legalWatch` — ручной/импортный список на тайтл (тип описан в lib/types.ts);
 *  2) при пустом списке блок не рендерится вовсе — пустая плашка на 8000 страниц
 *     хуже, чем её отсутствие.
 *
 * Что добавить в данные, когда решите наполнять: официальные сервисы по регионам
 * (Crunchyroll, Netflix, Кинопоиск, Wink, more.tv), страницу лицензиара и ссылку
 * на первоисточник. Удобный источник — поле `streamingEpisodes`/`external` у Jikan
 * (MAL) и `licence_name_ru` у Shikimori; оба уже доступны в scripts/fetch-jikan.mjs
 * и scripts/enrich-shikimori-resumable.mjs.
 */
const ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.LEGAL_WATCH_ENABLED ?? '').toLowerCase());

export function LegalWatchBlock({ title }: { title: Title }) {
  const links = title.legalWatch ?? [];
  if (!ENABLED || !links.length) return null;
  const released = episodeCount(title);
  return (
    <section className="panel legal-watch" aria-label="Где смотреть легально">
      <h2 className="section-title">Где смотреть легально</h2>
      <p className="panel__note">
        Официальные сервисы, где тайтл доступен по лицензии{released ? ` (${released} ${plural(released, ['серия', 'серии', 'серий'])})` : ''}.
        Поддержка лицензионного просмотра помогает выходить новым сезонам.
      </p>
      <ul className="legal-watch__list">
        {links.map((l) => (
          <li key={l.url}>
            <a className="legal-watch__link" href={l.url} target="_blank" rel="noopener noreferrer nofollow">
              {l.name}
              {l.note ? <span className="legal-watch__note">{l.note}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
