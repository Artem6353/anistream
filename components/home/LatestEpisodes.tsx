import Link from 'next/link';
import { loadTitles } from '@/lib/catalog';
import { mskDayIndex } from '@/lib/schedule-core';
import { formatClock } from '@/lib/format';
import { PosterArt } from '@/components/anime/PosterArt';

/** «Новые эпизоды» (паттерн AniLibria/AnimeGO): ленты Вчера/Сегодня/Завтра с номерами
    серий и временем МСК — из airing-данных онгоингов. RSC, без клиентского JS. */
export function LatestEpisodes() {
  const now = Date.now();
  const from = now - 48 * 3600_000;
  const to = now + 48 * 3600_000;
  const rows: { at: number; ep: number; slug: string; ru: string; poster: string | null; romaji: string }[] = [];
  for (const t of loadTitles()) {
    for (const a of t.airing ?? []) {
      if (a.at >= from && a.at <= to) rows.push({ at: a.at, ep: a.ep, slug: t.slug, ru: t.ru, poster: t.poster, romaji: t.romaji });
    }
  }
  rows.sort((a, b) => a.at - b.at);
  if (!rows.length) return null;
  const today = mskDayIndex(now);
  const label = (at: number) => {
    const d = mskDayIndex(at);
    if (d === today) return 'Сегодня';
    if (d === (today + 6) % 7) return 'Вчера';
    if (d === (today + 1) % 7) return 'Завтра';
    return '';
  };
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const l = label(r.at) || 'На этой неделе';
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l)!.push(r);
  }
  const order = ['Вчера', 'Сегодня', 'Завтра', 'На этой неделе'];
  return (
    <section className="page-section" aria-label="Новые эпизоды">
      <div className="rail-head">
        <h2 className="section-title">Новые эпизоды</h2>
        <Link className="rail-head__more" href="/schedule">
          Всё расписание →
        </Link>
      </div>
      <div className="latest-eps">
        {order
          .filter((g) => groups.has(g))
          .map((g) => (
            <div className="latest-eps__group" key={g}>
              <h3 className="latest-eps__day">{g}</h3>
              <ul className="latest-eps__list">
                {groups.get(g)!.slice(0, 8).map((r) => (
                  <li key={`${r.slug}-${r.ep}`}>
                    <Link className="latest-eps__item" href={`/anime/${r.slug}/${r.ep}`}>
                      <span className="latest-eps__poster">
                        <PosterArt src={r.poster} seed={r.slug} initials={r.romaji} alt="" width={44} />
                      </span>
                      <span className="latest-eps__info">
                        <span className="latest-eps__title">{r.ru}</span>
                        <span className="latest-eps__meta">
                          Серия {r.ep} · {formatClock(r.at)} МСК
                        </span>
                      </span>
                      <span className="latest-eps__ep">EP {r.ep}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </section>
  );
}
