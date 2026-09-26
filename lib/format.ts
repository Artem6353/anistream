/** Склонение plural: plural(5, ['серия','серии','серий']) */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (d > 1 && d < 5) return forms[1];
  if (d === 1) return forms[0];
  return forms[2];
}

export const episodesWord = (n: number) => plural(n, ['серия', 'серии', 'серий']);

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Аудит блок 2: время и даты расписания — всегда МСК (Europe/Moscow),
 *  независимо от таймзоны устройства пользователя или сервера Vercel (UTC). */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '--:--';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' }).format(d);
}

export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} ${plural(min, ['минуту', 'минуты', 'минут'])} назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${plural(h, ['час', 'часа', 'часов'])} назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ${plural(d, ['день', 'дня', 'дней'])} назад`;
  return new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** Детерминированный хеш строки → uint32. */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
