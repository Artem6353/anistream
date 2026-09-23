import type { Metadata } from 'next';
import Link from 'next/link';
import { promises as fs } from 'node:fs';
import { cacheStats } from '@/lib/providers';
import { TITLES } from '@/lib/catalog';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminCookieName, verifyAdminCookie } from '@/lib/admin-auth';
import { ManualEditor } from '@/components/admin/ManualEditor';
import { TicketsPanel } from '@/components/admin/TicketsPanel';
import { MetricsPanel } from '@/components/admin/MetricsPanel';

export const metadata: Metadata = { title: 'Админ-панель', robots: { index: false, follow: false } };

interface WarmRow {
  slug: string;
  ok: boolean;
  kinds?: Record<string, number>;
}

/**
 * Админ-панель модерации (ТЗ 4.3): очередь автодобавленных/проблемных тайтлов,
 * статистика кэша и ошибок парсеров. Доступ: /admin/login → httpOnly-cookie
 * (HMAC от ADMIN_TOKEN); query-токен в URL не используется (W4 закрыт).
 */
export default async function AdminPage() {
  const store = await cookies();
  if (!verifyAdminCookie(store.get(adminCookieName())?.value)) redirect('/admin/login');

  let warm: { total: number; withSources: number; rows: WarmRow[] } | null = null;
  try {
    warm = JSON.parse(await fs.readFile('.cache/warm-summary.json', 'utf8'));
  } catch {}
  let providerErrors: { at: number; slug: string; episode: number; errors: Record<string, string> }[] = [];
  try {
    providerErrors = (await fs.readFile('.cache/provider-errors.jsonl', 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-50)
      .reverse()
      .map((l) => JSON.parse(l));
  } catch {}
  const cache = await cacheStats();

  const queue = (warm?.rows ?? []).filter((r) => !r.ok || Object.keys(r.kinds ?? {}).some((k) => k === 'demo'));
  const demoOnly = (warm?.rows ?? []).filter((r) => r.kinds && Object.values(r.kinds).every((v) => v) && (r.kinds['demo'] ?? 0) > 0 && !r.kinds['cache'] && !r.kinds['synth'] && !r.kinds['guess']);

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <header className="page-head">
        <h1>Админ-панель · модерация</h1>
        <p>
          Тайтлов в каталоге: {TITLES.length} · записей кэша источников: {cache.entries} · warm: {warm?.withSources ?? '—'}/{warm?.total ?? '—'}
        </p>
      </header>

      <section className="panel" style={{ marginTop: 12 }}>
        <h2 className="section-title">Очередь модерации ({queue.length})</h2>
        <p className="panel__note">Тайтлы, у которых нет ни одного реального источника (только тест-поток) — проверить связи, дозапустить hydrate или bridge.</p>
        <ul className="admin-list">
          {queue.slice(0, 60).map((r) => (
            <li key={r.slug}>
              <Link href={`/anime/${r.slug}`}>{r.slug}</Link>
              <span className="panel__note">{JSON.stringify(r.kinds ?? {})}</span>
            </li>
          ))}
          {!queue.length ? <li className="panel__note">Очередь пуста — все тайтлы с источниками.</li> : null}
        </ul>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="section-title">Только тест-поток ({demoOnly.length})</h2>
        <ul className="admin-list">
          {demoOnly.slice(0, 40).map((r) => (
            <li key={r.slug}>
              <Link href={`/anime/${r.slug}`}>{r.slug}</Link>
              <span className="panel__note">guess/cache/synth отсутствуют</span>
            </li>
          ))}
          {!demoOnly.length ? <li className="panel__note">Нет тайтлов без реальных источников.</li> : null}
        </ul>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="section-title">Ошибки парсеров ({providerErrors.length})</h2>
        <ul className="admin-list">
          {providerErrors.map((e, i) => (
            <li key={i}>
              <Link href={`/anime/${e.slug}`}>
                {e.slug} · ep {e.episode}
              </Link>
              <span className="panel__note">{JSON.stringify(e.errors).slice(0, 140)}</span>
            </li>
          ))}
          {!providerErrors.length ? <li className="panel__note">Ошибок не зафиксировано.</li> : null}
        </ul>
      </section>

      <MetricsPanel />
      <ManualEditor />

      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="section-title">Регламент</h2>
        <p className="panel__note">
          Автодобавление: GitHub Actions every 6h (sync-catalog.yml) → PR/commit в main → автодеплой Vercel.
          Ручная допроверка: npm run warm (очередь), HYDRATE_MODE=live npm run hydrate (живые источники),
          npm run enrich (RU-описания и кадры Shikimori).
        </p>
      </section>
    </div>
  );
}
