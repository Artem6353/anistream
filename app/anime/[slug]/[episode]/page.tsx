import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 3600;
import { getTitle, loadTitles } from '@/lib/catalog';
import { episodeCount } from '@/lib/episodes';
import dynamic from 'next/dynamic';

// Плеер (hls.js + контролы) — только клиент и лениво: минус ~100 КБ из First Load JS (ТЗ блок 8)
const PlayerShell = dynamic(() => import('@/components/player/PlayerShell').then((m) => m.PlayerShell));
import { Rail } from '@/components/anime/Rail';
import { PosterCard } from '@/components/anime/PosterCard';
import { similarTitles } from '@/lib/catalog';
import { titleHasSources } from '@/lib/episode-sources';
import { titleWithYear } from '@/lib/text';
import { getProvidersConfig } from '@/lib/config/providers.config';
import { JsonLd, breadcrumbsLd } from '@/components/system/JsonLd';

interface Props {
  params: Promise<{ slug: string; episode: string }>;
}

/* Аудит 2026-10 (ТЗ 2.2): как и у страницы тайтла, без generateStaticParams маршрут
 * был динамическим и revalidate не работал. Предрендерим первую серию популярных
 * тайтлов (точка входа из поиска и карточек); остальные серии Next дорисует
 * on-demand и закэширует (dynamicParams = true). Полный набор (тайтл × серия) —
 * это сотни тысяч страниц, его не собрать ни здесь, ни на Vercel. */
/* Замер в песочнице (1 ГБ RAM, heap 700 МБ): даже 10 предрендеренных страниц серий
   роняют сборку в «Reached heap limit» — страница серии тянет тяжёлый клиентский
   PlayerShell (40 КБ + hls.js). Поэтому по умолчанию 0: страницы серий рисуются
   on-demand и уходят в ISR-кэш после первого запроса (dynamicParams = true).
   На машине с бо́льшей памятью лимит можно поднять через env. */
const STATIC_EPISODE_TITLE_LIMIT = Number(process.env.STATIC_EPISODE_TITLE_LIMIT ?? 0);

export function generateStaticParams() {
  if (STATIC_EPISODE_TITLE_LIMIT <= 0) return [];
  return loadTitles()
    .filter((t) => !t.hidden && (episodeCount(t) ?? 0) > 0)
    .sort((a, b) => b.favourites - a.favourites || b.score - a.score)
    .slice(0, STATIC_EPISODE_TITLE_LIMIT)
    .map((t) => ({ slug: t.slug, episode: '1' }));
}

/* Аудит 30.09 (P2-18): валидация номера серии — /anime/x/999 и /anime/x/abc раньше
   рендерили клампнутый контент с canonical на СЫРОЙ url (бесконечные soft-дубли).
   Аудит 2026-10 (ТЗ 1.2): граница — НЕ поле `episodes` (у онгоингов там стояла
   заглушка 24, из-за чего /anime/one-piece/25 отдавал 404 при 1134 вышедших сериях),
   а единое правило lib/episodes.ts. */
function validEpisode(t: Parameters<typeof episodeCount>[0], raw: string): number | null {
  const n = Number(raw);
  const max = episodeCount(t) ?? 0;
  if (!Number.isInteger(n) || n < 1 || n > Math.max(1, max)) return null;
  return n;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, episode: episodeRaw } = await params;
  const t = getTitle(slug);
  if (!t) notFound();
  const episode = validEpisode(t, episodeRaw);
  if (episode === null) notFound();
  const name = titleWithYear(t.ru, t.year);
  const description = `Смотреть ${name} серия ${episode} онлайн: озвучки и субтитры, автопереход к следующей серии, сохранение прогресса.`;
  /* ТЗ 1.7: страницы серий не индексируются, пока у тайтла нет подтверждённого
     источника видео. Тонкие страницы с пустым плеером тянули качество хоста вниз;
     индексация вернётся автоматически, как только sync-sources наполнит таблицу. */
  const indexed = await titleHasSources(t);
  const title = `${name} — серия ${episode}`;
  const image = `/anime/${slug}/opengraph-image`;
  return {
    title,
    description,
    alternates: { canonical: `/anime/${slug}/${episode}` },
    robots: indexed ? { index: true, follow: true } : { index: false, follow: true },
    /* ТЗ 1.5: раньше серия наследовала корневые og:title «AniNova — каталог аниме»
       и og:url главной — карточка в соцсетях вела не на серию. */
    openGraph: {
      type: 'video.episode',
      url: `/anime/${slug}/${episode}`,
      locale: 'ru_RU',
      siteName: 'AniNova',
      title,
      description,
      images: image,
    },
    twitter: { card: 'summary_large_image', title, description, images: image },
  };
}

export default async function PlayerPage({ params }: Props) {
  const { slug, episode: episodeRaw } = await params;
  const title = getTitle(slug);
  if (!title) notFound();
  const episode = validEpisode(title, episodeRaw);
  if (episode === null) notFound();
  const similar = similarTitles(title, 10);
  const total = episodeCount(title);
  const base = getProvidersConfig().site.url;

  return (
    <>
      {/* ТЗ 3.2: крошки для серии (BreadcrumbList не было, h1 отсутствовал вовсе) */}
      <JsonLd
        data={breadcrumbsLd(base, [
          { name: 'Каталог', href: '/catalog' },
          { name: title.ru, href: `/anime/${title.slug}` },
          { name: `Серия ${episode}`, href: `/anime/${title.slug}/${episode}` },
        ])}
      />
      <PlayerShell title={title} episode={episode} />
      <div className="container" style={{ paddingTop: 18 }}>
        {/* Единственный h1 страницы серии: раньше его не было вовсе — документ
            начинался с h2 «Похожее» (ТЗ 3.3.4 / SEO). */}
        <h1 className="player-heading">
          {title.ru} — серия {episode}
          {total && total > 1 ? <span className="player-heading__total"> из {total}</span> : null}
        </h1>
        <nav className="player-nav" aria-label="Навигация по сериям">
          {episode > 1 ? (
            <Link className="btn btn--outline btn--md" href={`/anime/${slug}/${episode - 1}`}>
              ← Серия {episode - 1}
            </Link>
          ) : (
            <span />
          )}
          <Link className="btn btn--ghost btn--md" href={`/anime/${slug}`}>
            К описанию
          </Link>
          {total && episode < total ? (
            <Link className="btn btn--outline btn--md" href={`/anime/${slug}/${episode + 1}`}>
              Серия {episode + 1} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
      {similar.length ? (
        <Rail title="Похожее">
          {similar.map((t) => (
            <PosterCard key={t.slug} title={t} showBadge={false} />
          ))}
        </Rail>
      ) : null}
    </>
  );
}
