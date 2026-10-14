'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Title } from '@/lib/types';
import { useEffect, useState } from 'react';
import { episodeCount, episodeInfo } from '@/lib/episodes';
import { availabilityHint } from '@/lib/source-hints';
import { useLibrary } from '@/lib/library';
import { IconCheck, IconPlay } from '@/components/ui/icons';

/** Список серий с отметками о просмотре и текущей позицией. */
export function EpisodeList({ title, count }: { title: Title; count?: number | null }) {
  const { history } = useLibrary();
  const pathname = usePathname();
  const router = useRouter();
  const [avail, setAvail] = useState<Record<number, string> | null>(null);
  /* ТЗ 4.1 (4.6): поле «Перейти к серии» — Enter открывает указанную серию. */
  const [jump, setJump] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/availability/${title.slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !cancelled && j && setAvail(j.episodes))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [title.slug]);
  const entry = history.find((h) => h.slug === title.slug);
  /* ТЗ 1.2: список строим от числа ВЫШЕДШИХ серий. Раньше брали поле `episodes`,
     где у онгоингов лежала заглушка импортера 24: у «Ван-Пис» рисовалось 24 кнопки
     вместо 1134, а серия 25 отдавала 404. */
  /* count — число со страницы (releasedCountFor: каталог + БД у онгоингов); на клиенте
     overrides из БД недоступны, поэтому без него список у онгоингов обрывался раньше. */
  const total = (count !== undefined ? count : episodeCount(title)) ?? 0;
  const { totalUnknown } = episodeInfo(title);
  const CHUNK = 60;
  const [chunk, setChunk] = useState(0);
  const chunks = Math.max(1, Math.ceil(total / CHUNK));
  const episodes = Array.from({ length: total }, (_, i) => i + 1).slice(chunk * CHUNK, (chunk + 1) * CHUNK);

  if (!total) {
    return (
      <div className="episodes">
        <div className="episodes__head">
          <h2 className="section-title">Серии</h2>
        </div>
        <p className="panel__note">
          Число серий ещё не объявлено: как только источник подтвердит количество или даты выхода, список появится здесь автоматически.
        </p>
      </div>
    );
  }

  return (
    <div className="episodes">
      <div className="episodes__head">
        <h2 className="section-title">Серии</h2>
        <span className="episodes__count">
          {total}
          {totalUnknown ? '+' : ''} шт.
        </span>
      </div>
      {total > 1 ? (
        <form
          className="episodes__jump"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(jump);
            if (Number.isInteger(n) && n >= 1 && n <= total) {
              router.push(`/anime/${title.slug}/${n}`);
              setJump('');
            }
          }}
        >
          <input
            className="input episodes__jump-input"
            inputMode="numeric"
            placeholder={`Перейти к серии (1–${total})`}
            value={jump}
            onChange={(e) => setJump(e.target.value.replace(/\D/g, '').slice(0, 4))}
            aria-label="Перейти к серии"
          />
        </form>
      ) : null}
      {chunks > 1 ? (
        <div className="chips" style={{ marginBottom: 10 }}>
          {Array.from({ length: chunks }, (_, i) => (
            <button key={i} type="button" className={`chip ${chunk === i ? 'is-active' : ''}`} onClick={() => setChunk(i)}>
              {i * CHUNK + 1}–{Math.min(total, (i + 1) * CHUNK)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="episodes__grid">
        {episodes.map((ep) => {
          const watched = history.find((h) => h.slug === title.slug && h.episode === ep);
          const done = watched && watched.duration > 0 && watched.position / watched.duration > 0.9;
          const current = pathname?.endsWith(`/${ep}`);
          return (
            <Link
              key={ep}
              href={`/anime/${title.slug}/${ep}`}
              className={`episode ${current ? 'is-current' : ''} ${done ? 'is-done' : ''}`}
              aria-current={current ? 'true' : undefined}
            >
              <span className="episode__num">{ep}</span>
              <span className="episode__label">Серия {ep}</span>
              {avail ? (
                <span
                  className={`episode__avail episode__avail--${availabilityHint(avail[ep]).tone}`}
                  title={availabilityHint(avail[ep]).label}
                />
              ) : null}
              {done ? (
                <span className="episode__done" title="Просмотрено">
                  <IconCheck size={13} />
                </span>
              ) : watched ? (
                <span
                  className="episode__resume"
                  title={`Продолжить с ${Math.round((watched.position / Math.max(1, watched.duration)) * 100)}%`}
                >
                  <IconPlay size={12} />
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
      {entry ? (
        <Link className="btn btn--primary btn--md" href={`/anime/${title.slug}/${entry.episode}`}>
          <IconPlay size={15} />
          Продолжить с серии {entry.episode}
        </Link>
      ) : (
        <Link className="btn btn--primary btn--md" href={`/anime/${title.slug}/1`}>
          <IconPlay size={15} />
          Смотреть с первой серии
        </Link>
      )}
    </div>
  );
}
