import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cookies } from 'next/headers';
import { adminCookieName, verifyAdminCookie } from '@/lib/admin-auth';

const FILE = 'lib/data/manual-sources.json';

/** Ручной источник: embed (iframe) или прямые файлы (mp4/HLS). */
type ManualSource = { label?: string; embedUrl?: string; files?: Array<{ quality?: string; url?: string; type?: string }> };
type ManualData = Record<string, Record<string, ManualSource[]>>;

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminCookie(store.get(adminCookieName())?.value);
}

async function read(): Promise<ManualData> {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ManualData) : {};
  } catch {
    return {};
  }
}

/** Атомарная запись (tmp + rename): параллельные правки не оставляют половину файла. */
async function write(data: ManualData): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1));
  await fs.rename(tmp, FILE);
}

/** Редактор ручных источников (ТЗ 4.3): POST добавить, DELETE убрать. Только admin-cookie. */
export async function POST(request: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as {
    slug?: unknown;
    episode?: unknown;
    label?: unknown;
    embedUrl?: unknown;
  };
  const slug = typeof body.slug === 'string' ? body.slug.trim().slice(0, 120) : '';
  const episode = typeof body.episode === 'number' ? body.episode : Number.parseInt(String(body.episode ?? ''), 10);
  const embedUrl = typeof body.embedUrl === 'string' ? body.embedUrl.trim() : '';
  if (!slug || !Number.isInteger(episode) || episode < 1 || !embedUrl) {
    return NextResponse.json({ error: 'slug, episode, embedUrl обязательны' }, { status: 400 });
  }
  /* iframe напрямую получает этот URL: пускаем только http(s), иначе admin-cookie
     + `javascript:`/`data:` дают хранимый XSS в плеере. */
  let parsed: URL;
  try {
    parsed = new URL(embedUrl);
  } catch {
    return NextResponse.json({ error: 'embedUrl должен быть абсолютным URL' }, { status: 400 });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return NextResponse.json({ error: 'embedUrl должен быть http(s)' }, { status: 400 });
  }

  const data = await read();
  const byEp = (data[slug] ??= {});
  const list = (byEp[String(episode)] ??= []);
  list.push({ label: typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 120) : 'Ручной источник', embedUrl });
  await write(data);
  return NextResponse.json({ ok: true, total: list.length });
}

export async function DELETE(request: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  const u = new URL(request.url);
  const slug = u.searchParams.get('slug') ?? '';
  const ep = u.searchParams.get('episode') ?? '';
  const idx = Number(u.searchParams.get('idx') ?? -1);
  const data = await read();

  /* Аудит (P1-5): раньше здесь было `delete data[slug][ep]` — при неизвестном
     slug/эпизоде это TypeError («Cannot convert undefined or null to object») и
     голый 500. Теперь все обращения через опциональную цепочку, а отсутствие
     записи отдаёт 404. */
  const list = data?.[slug]?.[ep];
  if (!slug || !ep || !Array.isArray(list) || !list.length) {
    return NextResponse.json({ error: 'источник не найден' }, { status: 404 });
  }
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) {
    return NextResponse.json({ error: 'idx вне диапазона' }, { status: 400 });
  }
  list.splice(idx, 1);
  if (!list.length) delete data[slug][ep];
  if (data[slug] && !Object.keys(data[slug]).length) delete data[slug];
  await write(data);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!(await authed())) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  return NextResponse.json(await read());
}
