/** Структурированное JSON-логирование серверных роутов (аудит P3-6).
    Без зависимостей: Vercel/Node собирают stdout в логи; формат пригоден для grep/jq. */
type Level = 'info' | 'warn' | 'error';

export function log(level: Level, msg: string, ctx?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...ctx });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
