import { describe, expect, it } from 'vitest';
import { checkPassword, humanizeAuthError, validateBio, validateEmail, validatePassword, validateUsername } from '../lib/auth/validation';

/** Валидация форм входа/регистрации: правила и тексты ошибок — часть UX. */
describe('validateEmail', () => {
  it('принимает обычные адреса', () => {
    for (const email of ['a@b.ru', 'user.name+tag@sub.example.com']) expect(validateEmail(email)).toBeNull();
  });

  it('требует непустое значение и валидный формат', () => {
    expect(validateEmail('')).toBe('Укажите email');
    expect(validateEmail('nope')).not.toBeNull();
    expect(validateEmail('a@b')).not.toBeNull();
    expect(validateEmail('a b@c.ru')).not.toBeNull();
  });

  it('подсказывает опечатку в популярном домене', () => {
    expect(validateEmail('user@gmial.com')).toContain('gmail.com');
  });
});

describe('checkPassword', () => {
  it('короткий пароль — ошибка с подсказкой', () => {
    const result = checkPassword('ab1');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('8');
  });

  it('без цифры — ошибка', () => {
    expect(checkPassword('longpassword').ok).toBe(false);
  });

  it('надёжный пароль проходит и получает максимальный балл', () => {
    const result = checkPassword('AniStream2026!');
    expect(result.ok).toBe(true);
    expect(result.score).toBe(4);
    expect(result.error).toBeNull();
  });

  it('validatePassword возвращает null для валидного пароля', () => {
    expect(validatePassword('kirito123')).toBeNull();
  });
});

describe('validateUsername', () => {
  it('принимает латиницу, цифры, дефис и подчёркивание', () => {
    expect(validateUsername('kirito_fan-99')).toBeNull();
  });

  it('отклоняет короткие, длинные и недопустимые ники', () => {
    expect(validateUsername('ab')).toContain('3');
    expect(validateUsername('a'.repeat(25))).toContain('24');
    expect(validateUsername('-start')).not.toBeNull();
    expect(validateUsername('имя')).not.toBeNull();
  });

  it('зарезервированные ники и сегменты кабинета недоступны', () => {
    expect(validateUsername('admin')).toContain('зарезервирован');
    // /profile/list, /profile/history — реальные маршруты, ник занял бы их.
    expect(validateUsername('list')).toContain('зарезервирован');
    expect(validateUsername('history')).toContain('зарезервирован');
  });
});

describe('validateBio', () => {
  it('ограничивает длину и управляющие символы', () => {
    expect(validateBio('Люблю сёнены')).toBeNull();
    expect(validateBio('x'.repeat(281))).toContain('280');
    expect(validateBio('bad\u0007bell')).toContain('Недопустимые');
  });
});

describe('humanizeAuthError', () => {
  it('переводит типовые ошибки Supabase', () => {
    expect(humanizeAuthError('Invalid login credentials')).toBe('Неверный email или пароль');
    expect(humanizeAuthError('User already registered')).toContain('уже зарегистрирован');
    expect(humanizeAuthError('Email not confirmed')).toContain('Подтвердите email');
    expect(humanizeAuthError('Email rate limit exceeded')).toContain('Подождите');
  });

  it('объясняет отключённый Google-провайдер', () => {
    expect(humanizeAuthError('Provider is not enabled')).toContain('docs/AUTH-SETUP.md');
  });

  it('неизвестную ошибку не проглатывает', () => {
    expect(humanizeAuthError('Something odd happened')).toBe('Something odd happened');
    expect(humanizeAuthError('')).toBe('Не удалось выполнить действие');
  });
});
