'use client';

import { useEffect, useState } from 'react';

type Ticket = { id: string; ts: number; email?: string; url?: string; text?: string; slug?: string | null; status?: string; slug2?: string };
type Report = { id: string; ts: number; slug?: string; episode?: number; source?: string; problem?: string };

/** Очередь тикетов (A9.2): DMCA-заявления + жалобы на источники, скрытие тайтла в 1 клик. */
export function TicketsPanel() {
  const [data, setData] = useState<{ dmca: Ticket[]; reports: Report[] } | null>(null);
  useEffect(() => {
    fetch('/api/admin/tickets')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);
  const hide = async (slug: string, hidden: boolean) => {
    const r = await fetch('/api/admin/hide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, hidden }) });
    if (r.ok) alert(`${hidden ? 'Скрыт' : 'Восстановлен'}: ${slug}`);
  };
  if (!data) return null;
  return (
    <section className="admin-section" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="admin-section__head">
        <h2 className="admin-section__title">Тикеты: DMCA и жалобы на источники</h2>
      </div>
      <div>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>DMCA-заявления ({data.dmca.length})</h3>
        {data.dmca.length === 0 ? <p className="panel__note">Пусто.</p> : null}
        {data.dmca.map((t) => (
          <div className="warm-card" key={t.id}>
            <div className="warm-card__top">
              <span>
                <strong>{t.email}</strong> · {t.url}
              </span>
              <span className={`pill ${t.status === 'new' ? 'pill--upcoming' : 'pill--aired'}`}>{t.status}</span>
            </div>
            <p className="warm-card__note">{t.text}</p>
            {t.slug ? (
              <div className="warm-card__buttons">
                <button className="btn btn--outline btn--sm" onClick={() => void hide(t.slug!, true)}>
                  Скрыть тайтл
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => void hide(t.slug!, false)}>
                  Вернуть
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Жалобы на источники ({data.reports.length})</h3>
        {data.reports.length === 0 ? <p className="panel__note">Пусто.</p> : null}
        {data.reports.map((r) => (
          <div className="warm-card" key={r.id}>
            <span>
              {r.slug} · серия {r.episode} · {r.source} — <em>{r.problem}</em>
            </span>
            {r.slug ? (
              <div className="warm-card__buttons">
                <button className="btn btn--outline btn--sm" onClick={() => void hide(r.slug!, true)}>
                  Скрыть тайтл
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
