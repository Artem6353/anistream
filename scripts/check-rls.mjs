/* RLS-оракулы прод-БД Supabase (аудит 30.09, P0-2/P0-3/P0-5): БЕЗ записей и без
 * service-ключа — только анонимные запросы, которые гарантированно НЕ мутируют данные:
 *   - insert review_reactions с несуществующим review_id: 403 = RLS закрыт (010 применена),
 *     409/23503 = RLS пропустил (010 НЕ применена — накрутка реакций открыта);
 *   - insert dmca_requests/source_reports пустым телом: 401/403 = закрыто (011 применена),
 *     400/23502 = открыто (011 НЕ применена);
 *   - select profiles с колонками 004 (avatar_url, pinned_achievements): 200 = 004 на месте.
 * Запуск: SMOKE_URL=https://aninova-catalog.vercel.app npm run check:rls
 * (anon-ключ извлекается из клиентского бандла, как в обычном браузере). */
const BASE = process.env.SMOKE_URL ?? 'http://localhost:3000';

const probe = async (label, fn) => {
  try {
    const r = await fn();
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${label}: ${r.got} (ожидалось ${r.want})`);
    return r.ok;
  } catch (e) {
    console.log(`ERR   ${label}: ${e}`);
    return false;
  }
};

const supaCreds = async () => {
  const html = await (await fetch(BASE + '/')).text();
  const chunk = (html.match(/\/_next\/static\/chunks\/app\/layout-[^"]+\.js/) || [])[0];
  if (!chunk) throw new Error('layout chunk not found');
  const js = await (await fetch(BASE + chunk)).text();
  const url = (js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/) || [])[0];
  const anon = (js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/) || [])[0];
  if (!url || !anon) throw new Error('supabase creds not found in bundle');
  return { url, anon };
};

const run = async () => {
  const { url, anon } = await supaCreds();
  const H = { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  let bad = 0;

  bad += !(await probe('010: anon insert review_reactions → 403', async () => {
    const r = await fetch(`${url}/rest/v1/review_reactions`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ review_id: '00000000-0000-0000-0000-000000000000', user_id: 'rls-oracle', kind: 'like' }),
    });
    return { ok: r.status === 403, got: r.status, want: 403 };
  }));

  for (const tbl of ['dmca_requests', 'source_reports']) {
    bad += !(await probe(`011: anon insert ${tbl} → 401/403`, async () => {
      const r = await fetch(`${url}/rest/v1/${tbl}`, { method: 'POST', headers: H, body: '{}' });
      return { ok: r.status === 401 || r.status === 403, got: r.status, want: '401/403' };
    }));
  }

  bad += !(await probe('004: anon select profiles(avatar_url,pinned_achievements) → 200', async () => {
    const r = await fetch(`${url}/rest/v1/profiles?select=user_id,username,avatar_url,pinned_achievements&limit=1`, { headers: H });
    return { ok: r.status === 200, got: r.status, want: 200 };
  }));

  bad += !(await probe('RLS: anon select profile_history → пусто (без утечки)', async () => {
    const r = await fetch(`${url}/rest/v1/profile_history?select=user_id&limit=5`, { headers: H });
    const j = r.ok ? await r.json() : null;
    return { ok: r.status === 200 && Array.isArray(j) && j.length === 0, got: `${r.status} rows=${Array.isArray(j) ? j.length : '?'}`, want: '200 rows=0' };
  }));

  console.log(bad ? `\n${bad} проверок НЕ прошли — миграции не применены (см. DEPLOY.md, реестр)` : '\nВсе RLS-оракулы зелёные');
  process.exit(bad ? 1 : 0);
};

run().catch((e) => { console.error('check:rls failed:', e.message); process.exit(1); });
