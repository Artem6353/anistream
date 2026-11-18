/**
 * Валидация форм входа/регистрации и перевод ошибок Supabase на русский.
 *
 * Чистые функции без сети — чтобы правила проверялись в unit-тестах, а не «руками
 * в браузере»: от них зависит и UX подсказок, и текст ошибки, который увидит человек.
 */

export type FieldError = string | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

/** Домены-однодневки и явные опечатки: ловим до запроса в Supabase. */
const EMAIL_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'yandex.ru.com': 'yandex.ru',
  'yandx.ru': 'yandex.ru',
  'mail.r': 'mail.ru',
};

export function validateEmail(value: string): FieldError {
  const email = value.trim();
  if (!email) return 'Укажите email';
  if (email.length > 254) return 'Слишком длинный email';
  if (!EMAIL_RE.test(email)) return 'Похоже, в адресе опечатка';
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const hint = EMAIL_TYPOS[domain];
  if (hint) return `Возможно, вы имели в виду @${hint}`;
  return null;
}

export interface PasswordCheck {
  ok: boolean;
  error: FieldError;
  /** 0..4 — для полоски «надёжность пароля». */
  score: number;
  hints: string[];
}

/** Пароль: минимум 8 символов, буква и цифра. Дальше — бонусы к «силе». */
export function checkPassword(value: string): PasswordCheck {
  const hints: string[] = [];
  let score = 0;
  if (value.length >= 8) score++;
  else hints.push('минимум 8 символов');
  if (/[a-zA-Zа-яА-Я]/.test(value)) score++;
  else hints.push('хотя бы одна буква');
  if (/\d/.test(value)) score++;
  else hints.push('хотя бы одна цифра');
  if (/[^a-zA-Zа-яА-Я0-9]/.test(value)) score++;
  else hints.push('спецсимвол усилит пароль');

  const hardError = hints.slice(0, 3).some((h) => !h.startsWith('спецсимвол'));
  return {
    ok: !hardError,
    error: hardError ? `Пароль слабоват: ${hints.join(', ')}` : null,
    score: Math.max(0, Math.min(4, score)),
    hints,
  };
}

export function validatePassword(value: string): FieldError {
  return checkPassword(value).error;
}

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'support',
  'moderator',
  'anistream',
  'aninova',
  'profile',
  'auth',
  'api',
  'settings',
  'list',
  'history',
  'bookmarks',
  'achievements',
  'auth',
]);

/** Ник: 3–24 символа, латиница/цифры/`_`/`-`, не начинается с дефиса. */
export function validateUsername(value: string): FieldError {
  const username = value.trim();
  if (!username) return 'Придумайте ник';
  if (username.length < 3) return 'Минимум 3 символа';
  if (username.length > 24) return 'Максимум 24 символа';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(username)) {
    return 'Только латиница, цифры, «_» и «-», и не с дефиса';
  }
  if (RESERVED_USERNAMES.has(username.toLowerCase())) return 'Этот ник зарезервирован';
  return null;
}

/** Био: до 280 символов, без управляющих символов. */
export function validateBio(value: string): FieldError {
  if (value.length > 280) return 'Максимум 280 символов';
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return 'Недопустимые символы';
  return null;
}

/**
 * Ошибки Supabase Auth → человеческий текст.
 *
 * Сообщения англоязычные и меняются между версиями, поэтому опираемся на код
 * (`error.code`) и на подстроки; неизвестное отдаём как есть, но с префиксом —
 * молчаливое «что-то пошло не так» хуже.
 */
export function humanizeAuthError(message: string, code?: string | null): string {
  const text = `${message} ${code ?? ''}`.toLowerCase();
  if (text.includes('invalid login credentials')) return 'Неверный email или пароль';
  if (text.includes('email not confirmed')) return 'Подтвердите email — письмо уже отправлено';
  if (text.includes('user already registered') || text.includes('already been registered')) {
    return 'Этот email уже зарегистрирован — попробуйте войти';
  }
  if (text.includes('password should be at least')) return 'Пароль слишком короткий';
  if (text.includes('rate limit') || text.includes('too many requests')) {
    return 'Слишком много попыток. Подождите минуту и попробуйте снова';
  }
  if (text.includes('provider is not enabled') || text.includes('unsupported provider')) {
    return 'Вход через Google не настроен в проекте Supabase (см. docs/AUTH-SETUP.md)';
  }
  if (text.includes('signups not allowed')) return 'Регистрация закрыта в настройках Supabase';
  if (text.includes('email address is invalid') || text.includes('invalid email')) return 'Некорректный email';
  if (text.includes('fetch') || text.includes('network')) return 'Нет связи с сервером авторизации. Проверьте интернет';
  return message || 'Не удалось выполнить действие';
}
