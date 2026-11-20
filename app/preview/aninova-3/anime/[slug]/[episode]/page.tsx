import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTitle, similarTitles, toCardTitle } from '@/lib/catalog';
import { episodeInfo } from '@/lib/episodes';
import { maxEpisodeNumberDb, validEpisodeDb } from '@/lib/episode-route';
import { A3Theatre } from '@/components/aninova3/A3Theatre';
import { isProxiable } from '@/lib/img';
import { A3Rail } from '@/components/aninova3/A3Rail';
import { A3Card } from '@/components/aninova3/A3Card';

const ROOT = '/preview/aninova-3';

interface Props {
  params: Promise<{ slug: string; episode: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, episode } = await params;
  const t = getTitle(slug);
  return { title: t ? `${t.ru} — серия ${episode}` : 'Серия не найдена', robots: { index: false, follow: false } };
}

export default async function A3WatchPage({ params }: Props) {
  const { slug, episode: raw } = await params;
  const title = getTitle(slug);
  if (!title) notFound();
  const episode = await validEpisodeDb(title, raw);
  if (episode === null) notFound();
  const total = await maxEpisodeNumberDb(title);
  const { totalUnknown } = episodeInfo(title);
  const similar = similarTitles(title, 10);

  return (
    <>
      <div className="a3-wrap a3-watchhead">
        <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
          <Link href={`${ROOT}/catalog`}>Каталог</Link>
          <span aria-hidden>/</span>
          <Link href={`${ROOT}/anime/${title.slug}`}>{title.ru}</Link>
          <span aria-hidden>/</span>
          <span aria-current="page">Серия {episode}</span>
        </nav>
        <div className="a3-watchhead__row">
          <div>
            <p className="a3-kicker">Кинозал</p>
            <h1 className="a3-watchhead__title">
              {title.ru} — серия {episode}
              {total > 1 ? <span className="a3-muted"> из {total}</span> : null}
            </h1>
          </div>
          <div className="a3-watchhead__nav">
            {episode > 1 ? (
              <Link className="a3-btn a3-btn--ghost" href={`${ROOT}/anime/${title.slug}/${episode - 1}`}>
                ← Серия {episode - 1}
              </Link>
            ) : null}
            <Link className="a3-btn a3-btn--ghost" href={`${ROOT}/anime/${title.slug}`}>
              К описанию
            </Link>
            {episode < total ? (
              <Link className="a3-btn a3-btn--ghost" href={`${ROOT}/anime/${title.slug}/${episode + 1}`}>
                Серия {episode + 1} →
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <A3Theatre title={title} episode={episode} totalEpisodes={total} totalUnknown={totalUnknown} backdrop={isProxiable(title.banner) ? title.banner : null} />

      <div className="a3-wrap a3-watchnote">
        <p className="a3-muted">
          Плеер — действующий <code>PlayerShell</code>: те же провайдеры, HLS и подписанные URL, что и на текущем сайте. Если источники не
          подключены в этой среде, плеер честно покажет своё пустое состояние.
        </p>
        <p className="a3-muted">
          Пульт: <kbd>←</kbd> <kbd>→</kbd> — ±10 секунд на сцене, <kbd>Space</kbd> — пауза, <kbd>Enter</kbd> — выбрать контрол,
          <kbd>Esc</kbd> — назад.
        </p>
      </div>

      {similar.length ? (
        <A3Rail title="Похожее" action={{ href: `${ROOT}/anime/${title.slug}`, label: 'К тайтлу' }}>
          {similar.map((t) => (
            <A3Card key={t.slug} title={toCardTitle(t)} />
          ))}
        </A3Rail>
      ) : null}
    </>
  );
}
