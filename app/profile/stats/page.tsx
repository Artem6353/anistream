'use client';
// OG-карточка: next/og (satori) нестабилен в sandbox/low-memory сборках — PNG «Поделиться» рисуется клиентом (canvas), соцсети получают meta из layout.

import { useEffect, useMemo, useState } from 'react';
import { useLibrary } from '@/lib/library';
import { readCounters, readUnlocked } from '@/lib/achievements';
import { isSessionValid, supaWhoami } from '@/lib/sync';
import { myFollowing } from '@/lib/social-graph';
import { WEEKDAYS } from '@/lib/labels';
import { useToast } from '@/components/ui/Toaster';

/** Статистика пользователя (ТЗ блок 18.2): считается локально из истории/списков/счётчиков. */
export default function StatsPage() {
  const { history, lists } = useLibrary();
  const toast = useToast();

  const s = useMemo(() => {
    let watchSec = 0;
    const perWeekday = Array(7).fill(0) as number[];
    const perDay = new Map<string, number>();
    const slugs = new Set<string>();
    for (const h of history) {
      watchSec += Math.max(0, h.position || 0);
      const d = new Date(h.updatedAt ?? 0);
      perWeekday[(d.getDay() + 6) % 7]++;
      const key = d.toISOString().slice(0, 10);
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
      slugs.add(h.slug);
    }
    const genresRaw = (() => {
      try {
        return JSON.parse(localStorage.getItem('anistream:ach_genres') ?? '{}') as Record<string, number>;
      } catch {
        return {};
      }
    })();
    const topGenres = Object.entries(genresRaw).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const counters = readCounters();
    const extra = (() => {
      try {
        return JSON.parse(localStorage.getItem('anistream:ach_extra') ?? '{}') as { ratingsSum?: number };
      } catch {
        return {};
      }
    })();
    const avgRating = counters.ratings ? Math.round(((extra.ratingsSum ?? 0) / counters.ratings) * 10) / 10 : 0;
    // heatmap: последние ~26 недель (6 месяцев), колонки-недели × 7 дней
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 181);
    const cells: { key: string; count: number }[] = [];
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      cells.push({ key, count: perDay.get(key) ?? 0 });
    }
    const maxDay = Math.max(1, ...cells.map((c) => c.count));
    // ТЗ 23: матрица активности 7×24 и облако жанров
    const weekHour = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    for (const h of history) {
      const d = new Date(h.updatedAt ?? 0);
      weekHour[(d.getDay() + 6) % 7][d.getHours()]++;
    }
    const maxCell = Math.max(1, ...weekHour.flat());
    const unlocked = Object.keys(readUnlocked()).length;
    return { watchSec, perWeekday, topGenres, avgRating, titles: slugs.size, listsCount: Object.keys(lists).length, cells, maxDay, unlocked, weekHour, maxCell };
  }, [history, lists]);

  const hours = Math.round(s.watchSec / 3600);
  const maxWeekday = Math.max(1, ...s.perWeekday);
  const maxGenre = Math.max(1, ...s.topGenres.map(([, v]) => v));

  const share = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0b0d11';
    ctx.fillRect(0, 0, 1200, 630);
    const grad = ctx.createLinearGradient(0, 0, 1200, 630);
    grad.addColorStop(0, '#8b5cf6');
    grad.addColorStop(1, '#f472b6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1200, 6);
    ctx.fillStyle = '#eef2f8';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText('Моя статистика AniNova', 60, 140);
    ctx.font = '34px sans-serif';
    ctx.fillStyle = '#98a3b8';
    ctx.fillText(`${hours} ч просмотра · ${history.length} серий · ${s.titles} тайтлов`, 60, 240);
    ctx.fillText(`средняя оценка ${s.avgRating || '—'} · ачивок ${s.unlocked}/32`, 60, 300);
    ctx.fillText(`топ жанров: ${s.topGenres.slice(0, 3).map(([g]) => g).join(', ') || '—'}`, 60, 360);
    const a = document.createElement('a');
    a.download = 'aninova-stats.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
    toast('PNG сохранён');
  };

  return (
    <div className="container stats">
      <h1>Моя статистика</h1>
      <div className="stats__big">
        <div className="stats__card">
          <strong>{hours}</strong>
          <span>часов просмотра</span>
        </div>
        <div className="stats__card">
          <strong>{history.length}</strong>
          <span>серий</span>
        </div>
        <div className="stats__card">
          <strong>{s.titles}</strong>
          <span>тайтлов</span>
        </div>
        <div className="stats__card">
          <strong>{s.avgRating || '—'}</strong>
          <span>средняя оценка</span>
        </div>
      </div>

      <section className="stats__block">
        <h2>Топ-5 жанров</h2>
        {s.topGenres.length ? (
          <div className="stats__bars">
            {s.topGenres.map(([g, v]) => (
              <div className="stats__bar-row" key={g}>
                <span className="stats__bar-label">{g}</span>
                <span className="stats__bar">
                  <span style={{ width: `${(100 * v) / maxGenre}%` }} />
                </span>
                <span className="stats__bar-value">{v}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="stats__empty">Начните смотреть — жанры появятся здесь.</p>
        )}
      </section>

      <section className="stats__block">
        <h2>Серии по дням недели</h2>
        <div className="stats__week">
          {s.perWeekday.map((v, i) => (
            <div className="stats__week-col" key={i} title={`${WEEKDAYS[i]}: ${v}`}>
              <span className="stats__week-bar" style={{ height: `${(100 * v) / maxWeekday}%` }} />
              <span className="stats__week-label">{WEEKDAYS[i].slice(0, 2)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="stats__block">
        <h2>Heatmap за 6 месяцев</h2>
        <div className="stats__heatmap" aria-label="Активность по дням">
          {s.cells.map((c) => (
            <span
              key={c.key}
              className="stats__heat"
              title={`${c.key}: ${c.count}`}
              style={{ opacity: c.count ? 0.25 + (0.75 * c.count) / s.maxDay : 0.08 }}
            />
          ))}
        </div>
      </section>

      <section className="stats__block">
        <h2>Активность: дни × часы</h2>
        <div className="stats__wh" aria-label="Тепловая карта активности по часам">
          {WEEKDAYS.map((w, wi) => (
            <div className="stats__wh-row" key={w}>
              <span className="stats__wh-label">{w.slice(0, 2)}</span>
              {s.weekHour[wi].map((v, hi) => (
                <span key={hi} className="stats__wh-cell" title={`${w} ${hi}:00 — ${v}`} style={{ opacity: v ? 0.2 + (0.8 * v) / s.maxCell : 0.06 }} />
              ))}
            </div>
          ))}
        </div>
      </section>

      <GenreCloud history={history} />
      <FriendsTaste history={history} />

      <button type="button" className="btn btn--primary btn--md" onClick={share}>
        Поделиться (PNG)
      </button>
    </div>
  );
}

/** Кинокарта (ТЗ 23): облако жанров, размер шрифта ∝ частоте в истории. */
function GenreCloud({ history }: { history: Array<{ slug: string }> }) {
  const [cloud, setCloud] = useState<Array<[string, number]>>([]);
  useEffect(() => {
    const slugs = [...new Set(history.map((h) => h.slug))].slice(0, 60);
    if (!slugs.length) return;
    fetch(`/api/titles?slugs=${encodeURIComponent(slugs.join(','))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const counts = new Map<string, number>();
        for (const t of j?.items ?? []) for (const g of t.genres ?? []) counts.set(g, (counts.get(g) ?? 0) + 1);
        setCloud([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14));
      })
      .catch(() => {});
  }, [history]);
  if (!cloud.length) return null;
  const max = cloud[0][1];
  return (
    <section className="stats__block">
      <h2>Кинокарта жанров</h2>
      <p className="genre-cloud">
        {cloud.map(([g, v]) => (
          <span key={g} style={{ fontSize: `${13 + Math.round((18 * v) / max)}px`, opacity: 0.55 + (0.45 * v) / max }}>
            {g}
          </span>
        ))}
      </p>
    </section>
  );
}

/** Сравнение с друзьями (ТЗ 23): % совпадения вкусов по подпискам. */
function FriendsTaste({ history }: { history: Array<{ slug: string }> }) {
  const [rows, setRows] = useState<Array<{ uid: string; username: string; shared: number; jaccard: number }>>([]);
  useEffect(() => {
    if (!isSessionValid()) return;
    (async () => {
      const me = await supaWhoami().catch(() => null);
      if (!me) return;
      const uids = (await myFollowing().catch(() => [])).filter((u) => u !== me);
      if (!uids.length) return;
      const r = await fetch('/api/social/taste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uids, mySlugs: [...new Set(history.map((h) => h.slug))] }),
      }).catch(() => null);
      const j = r?.ok ? await r.json() : null;
      setRows(j?.rows ?? []);
    })();
  }, [history]);
  if (!rows.length) return null;
  return (
    <section className="stats__block">
      <h2>Совпадение вкусов с подписками</h2>
      <ul className="feed__list">
        {rows
          .sort((a, b) => b.jaccard - a.jaccard)
          .map((r) => (
            <li className="feed__item" key={r.uid}>
              <span className="feed__text">
                <strong>{r.username}</strong>: {r.jaccard}% совпадения · общих тайтлов: {r.shared}
              </span>
            </li>
          ))}
      </ul>
    </section>
  );
}
