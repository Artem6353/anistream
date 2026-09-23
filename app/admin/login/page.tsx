'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const router = useRouter();
  return (
    <div className="container" style={{ paddingTop: 48 }}>
      <form
        className="panel"
        style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
          if (r.ok) router.push('/admin');
          else setErr((await r.json()).error ?? 'ошибка');
        }}
      >
        <h1 className="section-title">Вход в админ-панель</h1>
        <input className="input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ADMIN_TOKEN" autoComplete="off" />
        {err ? <p className="panel__note" style={{ color: 'var(--danger)' }}>{err}</p> : null}
        <button className="btn btn--primary btn--md" type="submit">
          Войти
        </button>
        <p className="panel__note">Токен задаётся в env (ADMIN_TOKEN); после входа хранится в httpOnly-cookie, в URL не светится.</p>
      </form>
    </div>
  );
}
