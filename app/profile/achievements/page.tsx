'use client';

import { useMemo, useState } from 'react';
import { ACHIEVEMENTS, TIER_LABELS, buildContext, readUnlocked, type AchievementMeta, type AchievementTier } from '@/lib/achievements';
import { readStreak } from '@/lib/streak';

const FILTERS: Array<{ id: AchievementTier | 'all'; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'bronze', label: '🥉 Бронза' },
  { id: 'silver', label: '🥈 Серебро' },
  { id: 'gold', label: '🥇 Золото' },
  { id: 'platinum', label: '💎 Платина' },
  { id: 'secret', label: '🌟 Секретные' },
];

const TIER_EMOJI: Record<AchievementTier, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💎', secret: '🌟' };

/** Страница достижений (ТЗ блок 19): сетка 32, фильтр по уровням, модалка деталей,
    секретные до получения — «???» с размытием. */
export default function AchievementsPage() {
  const [filter, setFilter] = useState<AchievementTier | 'all'>('all');
  const [detail, setDetail] = useState<AchievementMeta | null>(null);
  const unlocked = useMemo(() => readUnlocked(), []);
  const ctx = useMemo(() => buildContext(readStreak()?.current ?? 0), []);

  const list = ACHIEVEMENTS.filter((a) => filter === 'all' || a.tier === filter);

  return (
    <div className="container ach-page">
      <p className="breadcrumbs">
        <a href="/profile/settings">Назад в профиль</a>
      </p>
      <h1>Достижения</h1>
      <p className="ach-page__count">
        Получено: {Object.keys(unlocked).length} из {ACHIEVEMENTS.length}
      </p>
      <div className="tabs" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={`tab ${filter === f.id ? 'is-active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="ach-grid">
        {list.map((a) => {
          const got = unlocked[a.id];
          const secretHidden = a.tier === 'secret' && !got;
          const cur = Math.min(a.goal, a.progress(ctx));
          return (
            <button key={a.id} type="button" className={`ach-card ${got ? 'is-got' : ''} ${secretHidden ? 'is-secret' : ''}`} onClick={() => setDetail(a)}>
              <span className="ach-card__emoji">{secretHidden ? '🔒' : TIER_EMOJI[a.tier]}</span>
              <span className="ach-card__title">{secretHidden ? '???' : a.title}</span>
              <span className="ach-card__desc">{secretHidden ? 'Секретная ачивка' : a.desc}</span>
              <span className="ach-card__bar">
                <span style={{ width: `${got ? 100 : Math.round((100 * cur) / a.goal)}%` }} />
              </span>
              <span className="ach-card__progress">{got ? 'получено' : `${cur}/${a.goal}`}</span>
            </button>
          );
        })}
      </div>

      {detail ? (
        <div className="auth-overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="auth-sheet">
            <button type="button" className="auth-close icon-btn" onClick={() => setDetail(null)} aria-label="Закрыть">
              ×
            </button>
            <h2>
              {TIER_EMOJI[detail.tier]} {detail.tier === 'secret' && !unlocked[detail.id] ? '???' : detail.title}
            </h2>
            <p>{TIER_LABELS[detail.tier]}</p>
            <p>{detail.tier === 'secret' && !unlocked[detail.id] ? 'Описание скрыто до получения.' : detail.desc}</p>
            <p className="ach-detail__how">Условие: {detail.how}</p>
            <p className="ach-detail__progress">
              Прогресс: {Math.min(detail.goal, detail.progress(ctx))}/{detail.goal}
            </p>
            {unlocked[detail.id] ? <p className="ach-detail__date">Получено: {new Date(unlocked[detail.id].unlockedAt).toLocaleDateString('ru-RU')}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
