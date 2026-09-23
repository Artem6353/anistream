'use client';

import { useEffect, useState } from 'react';

/** UI-редактор ручных источников (ТЗ 4.3/1.3): работает через admin-cookie. */
export function ManualEditor() {
  const [data, setData] = useState<Record<string, Record<string, { label?: string; embedUrl?: string }[]>>>({});
  const [form, setForm] = useState({ slug: '', episode: '1', label: '', embedUrl: '' });
  const [msg, setMsg] = useState('');

  const load = () => fetch('/api/admin/manual').then((r) => (r.ok ? r.json() : {})).then(setData).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <h2 className="section-title">Ручные источники</h2>
      <form
        className="reviews__form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await fetch('/api/admin/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, episode: Number(form.episode) }),
          });
          setMsg(r.ok ? 'добавлено' : (await r.json()).error ?? 'ошибка');
          load();
        }}
      >
        <div className="years-row">
          <input className="input" placeholder="slug тайтла" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          <input className="input" style={{ width: 90 }} type="number" min={1} value={form.episode} onChange={(e) => setForm({ ...form, episode: e.target.value })} />
        </div>
        <input className="input" placeholder="Название озвучки" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <input className="input" placeholder="https://…/embed или прямой mp4/m3u8" value={form.embedUrl} onChange={(e) => setForm({ ...form, embedUrl: e.target.value })} required />
        <button className="btn btn--primary btn--md" type="submit">
          Добавить источник
        </button>
        {msg ? <span className="panel__note">{msg}</span> : null}
      </form>
      <ul className="admin-list">
        {Object.entries(data).flatMap(([slug, eps]) =>
          Object.entries(eps).flatMap(([ep, list]) =>
            list.map((s, i) => (
              <li key={`${slug}-${ep}-${i}`}>
                <span>
                  {slug} · ep {ep} · {s.label ?? 'источник'}
                </span>
                <button
                  className="review__vote"
                  onClick={async () => {
                    void fetch(`/api/admin/manual?slug=${slug}&episode=${ep}&idx=${i}`, { method: 'DELETE' });
                    load();
                  }}
                >
                  удалить
                </button>
              </li>
            )),
          ),
        )}
        {!Object.keys(data).length ? <li className="panel__note">Ручных источников нет.</li> : null}
      </ul>
    </section>
  );
}
