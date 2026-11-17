/**
 * Диагностика окружения для /api/health (инцидент 2026-11-17).
 *
 * Зачем: при пересоздании проекта на Vercel в переменные попали имена, которых код
 * не читает (`TURNSTILE_SITE_KEY` вместо `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
 * `TURNSTILE_SECRET_KEY` вместо `TURNSTILE_SECRET`). Сайт при этом «работает»,
 * а отзывы молча возвращают 403, капча не рендерится, админка недоступна.
 *
 * Здесь отдаём ТОЛЬКО булевы флаги «переменная задана» и человекочитаемые
 * предупреждения. Значения переменных не покидают сервер — это важно: health
 * доступен публично.
 */

export interface EnvFlag {
  present: boolean;
  /** Что перестаёт работать без переменной — для быстрой диагностики. */
  effect: string;
}

export type EnvFlags = Record<
  | 'supabaseUrl'
  | 'supabaseAnon'
  | 'supabaseService'
  | 'turnstileSite'
  | 'turnstileSecret'
  | 'captchaSecret'
  | 'adminToken'
  | 'siteUrl'
  | 'upstash'
  | 'backfillToken',
  EnvFlag
>;

export interface ConfigDiagnostics {
  flags: EnvFlags;
  warnings: string[];
}

const has = (env: NodeJS.ProcessEnv, ...keys: string[]): boolean =>
  keys.some((key) => (env[key] ?? '').trim().length > 0);

export function configDiagnostics(env: NodeJS.ProcessEnv = process.env): ConfigDiagnostics {
  const flags: EnvFlags = {
    supabaseUrl: {
      present: has(env, 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'),
      effect: 'каталог из БД, источники серий, отзывы',
    },
    supabaseAnon: {
      present: has(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL_ANON_KEY'),
      effect: 'браузерные отзывы, списки, авторизация (нужен redeploy после добавления)',
    },
    supabaseService: {
      present: has(env, 'SUPABASE_SERVICE_KEY'),
      effect: 'запись отзывов, реакции, синхронизация каталога',
    },
    turnstileSite: {
      present: has(env, 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'),
      effect: 'виджет капчи в форме отзыва',
    },
    turnstileSecret: {
      present: has(env, 'TURNSTILE_SECRET'),
      effect: 'проверка капчи на сервере (без неё отзывы → 403)',
    },
    captchaSecret: {
      present: has(env, 'CAPTCHA_SECRET'),
      effect: 'HMAC-капча отзывов (fail-closed)',
    },
    adminToken: {
      present: has(env, 'ADMIN_TOKEN'),
      effect: 'вход в /admin',
    },
    siteUrl: {
      present: has(env, 'NEXT_PUBLIC_SITE_URL'),
      effect: 'canonical/OG/sitemap указывают на правильный домен',
    },
    upstash: {
      present: has(env, 'UPSTASH_REDIS_REST_URL') && has(env, 'UPSTASH_REDIS_REST_TOKEN'),
      effect: 'горячий кэш источников',
    },
    backfillToken: {
      present: has(env, 'BACKFILL_TOKEN'),
      effect: 'обход кэша воркером гидрации (?live=1)',
    },
  };

  const warnings: string[] = [];
  if (!flags.supabaseUrl.present) warnings.push('NEXT_PUBLIC_SUPABASE_URL не задан: источники и отзывы недоступны');
  if (!flags.supabaseAnon.present) {
    warnings.push(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY не задан: отзывы/списки/авторизация в браузере не работают (после добавления нужен redeploy)',
    );
  }
  if (!flags.supabaseService.present) warnings.push('SUPABASE_SERVICE_KEY не задан: запись отзывов и синхронизация каталога отключены');
  if (!flags.turnstileSite.present || !flags.turnstileSecret.present) {
    warnings.push(
      'Turnstile не настроен: нужны NEXT_PUBLIC_TURNSTILE_SITE_KEY и TURNSTILE_SECRET (частая опечатка — TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY)',
    );
  }
  if (!flags.captchaSecret.present) warnings.push('CAPTCHA_SECRET не задан: отзывы отклоняются (fail-closed)');
  if (!flags.adminToken.present) warnings.push('ADMIN_TOKEN не задан: /admin недоступен');
  if (!flags.siteUrl.present) warnings.push('NEXT_PUBLIC_SITE_URL не задан: canonical/OG могут указывать на localhost');
  if (!flags.upstash.present) warnings.push('Upstash не настроен: кэш источников работает на файловом бэкенде');

  return { flags, warnings };
}
