'use client';

import { useState } from 'react';

/** DMCA-флоу (A1.1): форма заявления → тикет в админку → скрытие тайтла. */
export default function DmcaPage() {
  const [form, setForm] = useState({ email: '', url: '', rights: false, text: '' });
  const [state, setState] = useState<'idle' | 'ok' | string>('idle');
  return (
    <div className="container legal">
      <h1>Жалоба правообладателя (DMCA)</h1>
      <p>
        Заполните форму — тикет попадёт администратору, спорный материал будет скрыт из каталога в течение 24 часов.
        Ложные заявления преследуются по закону.
      </p>
      <form
        className="reviews__form"
        style={{ maxWidth: 640 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await fetch('/api/dmca', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
          setState(r.ok ? 'ok' : ((await r.json()).error as string) ?? 'ошибка');
        }}
      >
        <input className="input" type="email" required placeholder="Email для связи" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" required placeholder="URL тайтла на сайте (https://…/anime/…)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        <label className="check">
          <input type="checkbox" checked={form.rights} onChange={(e) => setForm({ ...form, rights: e.target.checked })} required />
          <span>Подтверждаю, что являюсь правообладателем или уполномоченным представителем</span>
        </label>
        <textarea className="input reviews__text" required rows={5} placeholder="Текст заявления: какие права нарушены, какие материалы" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
        <button className="btn btn--primary btn--md" type="submit">
          Отправить заявление
        </button>
        {state === 'ok' ? <p className="panel__note" style={{ color: 'var(--success)' }}>Тикет принят, мы свяжемся по указанному email.</p> : null}
        {state !== 'ok' && state !== 'idle' ? <p className="panel__note" style={{ color: 'var(--danger)' }}>{state}</p> : null}
      </form>
    </div>
  );
}
