'use client';

import { useCallback, useMemo, useState } from 'react';
import { CHRONOTYPE_LABEL, type AniDna } from '@/lib/profile/ani-dna';
import type { HistoryRow, ListRow, TitleCard } from '@/lib/profile/data';
import { useToast } from '@/components/ui/Toaster';

/**
 * AniDNA — креативная фича кабинета.
 *
 * Слева — живая карточка-портрет (архетип, жанры, часы, стрик), справа — разбор
 * «из чего это собрано» и кнопка «Скачать карточку»: canvas рисует PNG 1080×1350
 * прямо в браузере (без библиотек и без сервера), его удобно кинуть в чат.
 */
export function AniDnaCard({
  dna,
  displayName,
  lists,
  history,
  cards,
}: {
  dna: AniDna;
  displayName: string;
  lists: ListRow[];
  history: HistoryRow[];
  cards: Map<string, TitleCard>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: TitleCard[] = [];
    for (const row of history) {
      if (seen.has(row.slug)) continue;
      seen.add(row.slug);
      const card = cards.get(row.slug);
      if (card) out.push(card);
      if (out.length === 6) break;
    }
    return out;
  }, [history, cards]);

  const watching = lists.filter((l) => l.status === 'watching').length;
  const planned = lists.filter((l) => l.status === 'planned').length;

  const download = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await renderCard(dna, displayName);
      if (!blob) throw new Error('canvas недоступен');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `anidna-${dna.code}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Отзываем URL позже: Safari успевает начать загрузку не мгновенно.
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Карточка AniDNA сохранена');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось собрать карточку');
    } finally {
      setBusy(false);
    }
  }, [busy, dna, displayName, toast]);

  return (
    <div className="dna">
      <section
        className="dna__card"
        style={{ backgroundImage: `linear-gradient(150deg, ${dna.archetype.colors[0]}, ${dna.archetype.colors[1]})` }}
        aria-label={`AniDNA: ${dna.archetype.title}`}
      >
        <div className="dna__noise" aria-hidden="true" />
        <header className="dna__card-head">
          <span className="dna__badge">AniDNA</span>
          <span className="dna__code">{dna.code}</span>
        </header>
        <p className="dna__emoji" aria-hidden="true">{dna.archetype.emoji}</p>
        <h2 className="dna__title">{dna.archetype.title}</h2>
        <p className="dna__tagline">{dna.archetype.tagline}</p>

        <ul className="dna__genres">
          {dna.topGenres.slice(0, 4).map((genre) => (
            <li key={genre.name}>
              <span>{genre.name}</span>
              <span className="dna__genre-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(8, genre.share)}%` }} />
              </span>
              <span className="dna__genre-share">{genre.share}%</span>
            </li>
          ))}
          {!dna.topGenres.length && <li className="ds-muted">Жанры появятся после первых серий</li>}
        </ul>

        <dl className="dna__metrics">
          <div>
            <dt>часов</dt>
            <dd>{dna.hours.toLocaleString('ru-RU')}</dd>
          </div>
          <div>
            <dt>серий</dt>
            <dd>{dna.episodes}</dd>
          </div>
          <div>
            <dt>стрик</dt>
            <dd>{dna.streakDays}д</dd>
          </div>
        </dl>

        <footer className="dna__card-foot">
          <span>@{displayName}</span>
          <span>aninova · anidna</span>
        </footer>
      </section>

      <section className="ds-card ds-card--pad dna__side">
        <header className="dna__side-head">
          <h2>Твой аниме-отпечаток</h2>
          <p className="ds-muted">
            Считается из истории и списков: часы — по прогрессу серий, жанры — по тайтлам, стрик — по дням подряд.
          </p>
        </header>

        {dna.isColdStart ? (
          <p className="dna__hint">
            Пока мало данных: посмотрите пару серий или добавьте тайтл в список — портрет соберётся сам.
          </p>
        ) : null}

        <dl className="dna__facts">
          <div>
            <dt>Хронотип</dt>
            <dd>{CHRONOTYPE_LABEL[dna.chronotype]}</dd>
          </div>
          <div>
            <dt>Темп</dt>
            <dd>{dna.pace ? `${dna.pace} сер./день` : '—'}</dd>
          </div>
          <div>
            <dt>Дочитываемость</dt>
            <dd>{dna.completionRate}%</dd>
          </div>
          <div>
            <dt>Сейчас смотрю</dt>
            <dd>{watching}</dd>
          </div>
          <div>
            <dt>В планах</dt>
            <dd>{planned}</dd>
          </div>
          <div>
            <dt>Всего тайтлов</dt>
            <dd>{dna.titles}</dd>
          </div>
        </dl>

        {recent.length > 0 && (
          <div className="dna__recent">
            <h3>Из чего собрано</h3>
            <div className="dna__recent-row">
              {recent.map((card) => (
                <span key={card.slug} className="dna__recent-item" title={card.name}>
                  {card.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.poster} alt={card.name} width={44} height={62} loading="lazy" />
                  ) : (
                    <span className="ds-skeleton dna__recent-skeleton" aria-hidden="true" />
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="dna__actions">
          <button type="button" className="ds-btn ds-btn--primary" onClick={download} disabled={busy}>
            {busy && <span className="ds-spinner" aria-hidden="true" />}
            Скачать карточку
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--ghost"
            onClick={async () => {
              const text = `Мой AniDNA: ${dna.archetype.title} · ${dna.hours} ч · ${dna.episodes} серий · ${dna.code}`;
              try {
                if (navigator.share) await navigator.share({ title: 'AniDNA', text });
                else {
                  await navigator.clipboard.writeText(text);
                  toast('Скопировано в буфер');
                }
              } catch {
                /* пользователь закрыл share-диалог — не ошибка */
              }
            }}
          >
            Поделиться
          </button>
        </div>
      </section>
    </div>
  );
}

/** Рисует PNG-карточку 1080×1350 в canvas. Отдельная функция — без React и без сети. */
async function renderCard(dna: AniDna, displayName: string): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, '#0b0d11');
  gradient.addColorStop(1, dna.archetype.colors[0]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);

  // неоновые пятна
  for (const [x, y, color] of [
    [180, 220, dna.archetype.colors[1]],
    [900, 1150, dna.archetype.colors[0]],
  ] as const) {
    const glow = ctx.createRadialGradient(x, y, 10, x, y, 420);
    glow.addColorStop(0, `${color}66`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1080, 1350);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '600 30px Inter, system-ui, sans-serif';
  ctx.fillText('AniDNA · aninova', 72, 120);

  ctx.fillStyle = '#fff';
  ctx.font = '800 96px Inter, system-ui, sans-serif';
  wrapText(ctx, dna.archetype.title, 72, 300, 900, 104);

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '400 34px Inter, system-ui, sans-serif';
  wrapText(ctx, dna.archetype.tagline, 72, 430, 900, 44);

  ctx.font = '700 44px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  const metrics: Array<[string, string]> = [
    [formatHours(dna.hours), 'часов'],
    [`${dna.episodes}`, 'серий'],
    [`${dna.streakDays}`, 'дней стрик'],
  ];
  metrics.forEach(([value, label], i) => {
    const x = 72 + i * 300;
    ctx.font = '800 72px Inter, system-ui, sans-serif';
    ctx.fillText(value, x, 640);
    ctx.font = '400 28px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(label, x, 682);
    ctx.fillStyle = '#fff';
  });

  ctx.font = '600 34px Inter, system-ui, sans-serif';
  ctx.fillText('Любимые жанры', 72, 800);
  dna.topGenres.slice(0, 5).forEach((genre, i) => {
    const y = 860 + i * 62;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '500 32px Inter, system-ui, sans-serif';
    ctx.fillText(genre.name, 72, y);
    const width = (genre.share / 100) * 640;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, 420, y - 24, 640, 22, 11);
    ctx.fill();
    ctx.fillStyle = '#fff';
    roundRect(ctx, 420, y - 24, Math.max(24, width), 22, 11);
    ctx.fill();
  });

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '500 30px Inter, system-ui, sans-serif';
  ctx.fillText(`@${displayName} · код ${dna.code}`, 72, 1290);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95));
}

/** Часы в том же формате, что и в интерфейсе (0,7), а не «0.7». */
function formatHours(hours: number): string {
  return hours.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
  const words = text.split(' ');
  let line = '';
  let cursor = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cursor);
}
