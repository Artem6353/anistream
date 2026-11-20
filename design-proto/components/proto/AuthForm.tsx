'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { Icon } from './Icon';

/* Единая форма входа/регистрации для всех концепций: одинаковое поведение,
   разный вид (стили — в CSS концепции через [data-concept]). Клиентская
   валидация демонстрирует состояния полей; запрос никуда не уходит. */
export function AuthForm({
  mode,
  altHref,
  altLabel,
  altAction,
}: {
  mode: 'login' | 'register';
  altHref: string;
  altLabel: string;
  altAction: string;
}) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [consent, setConsent] = useState(false);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) next.email = 'Проверьте адрес: нужен формат name@mail.ru';
    if (password.length < 8) next.password = 'Минимум 8 символов';
    if (mode === 'register' && nickname.trim().length < 2) next.nickname = 'Минимум 2 символа';
    if (mode === 'register' && !consent) next.consent = 'Без согласия регистрация невозможна';
    setErrors(next);
    setSent(Object.keys(next).length === 0);
  };

  const err = (name: string) => errors[name];

  return (
    <div className={`auth auth--${mode}`} data-auth-form>
      <form onSubmit={submit} noValidate>
        {mode === 'register' ? (
          <div className="auth-field">
            <label htmlFor={`${id}-nick`}>Никнейм</label>
            <input
              id={`${id}-nick`}
              name="nickname"
              autoComplete="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              aria-invalid={!!err('nickname')}
              aria-describedby={err('nickname') ? `${id}-nick-err` : undefined}
              placeholder="artem"
            />
            {err('nickname') ? (
              <p className="auth-msg" id={`${id}-nick-err`} role="alert">
                {err('nickname')}
              </p>
            ) : (
              <p className="auth-hint">Видно другим: в профиле, клубах и комментариях.</p>
            )}
          </div>
        ) : null}

        <div className="auth-field">
          <label htmlFor={`${id}-email`}>Почта</label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!err('email')}
            aria-describedby={err('email') ? `${id}-email-err` : undefined}
            placeholder="name@mail.ru"
          />
          {err('email') ? (
            <p className="auth-msg" id={`${id}-email-err`} role="alert">
              {err('email')}
            </p>
          ) : null}
        </div>

        <div className="auth-field">
          <div className="auth-label">
            <label htmlFor={`${id}-pass`}>Пароль</label>
            {mode === 'login' ? <span className="auth-mini">Забыли?</span> : null}
          </div>
          <div className="auth-pass">
            <input
              id={`${id}-pass`}
              name="password"
              type={show ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!err('password')}
              aria-describedby={err('password') ? `${id}-pass-err` : undefined}
              placeholder="••••••••"
            />
            <button
              type="button"
              className="auth-eye"
              onClick={() => setShow((v) => !v)}
              aria-pressed={show}
              aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
            >
              <Icon name="eye" size={16} />
            </button>
          </div>
          {err('password') ? (
            <p className="auth-msg" id={`${id}-pass-err`} role="alert">
              {err('password')}
            </p>
          ) : mode === 'register' ? (
            <p className="auth-hint">8+ символов; пароль не покидает браузер в демо.</p>
          ) : null}
        </div>

        {mode === 'register' ? (
          <div className="auth-check">
            <input
              id={`${id}-consent`}
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-invalid={!!err('consent')}
              aria-describedby={err('consent') ? `${id}-consent-err` : undefined}
            />
            <label htmlFor={`${id}-consent`}>
              Согласен с правилами и обработкой данных. Комиксы в AniNova — только на русском.
            </label>
            {err('consent') ? (
              <p className="auth-msg" id={`${id}-consent-err`} role="alert">
                {err('consent')}
              </p>
            ) : null}
          </div>
        ) : null}

        <button className="auth-submit" type="submit">
          {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>

        {sent ? (
          <p className="auth-ok" role="status">
            Проверка пройдена. Это демо: письмо не отправляется, аккаунт не создаётся.
          </p>
        ) : null}
      </form>

      <p className="auth-alt">
        {altLabel} <Link href={altHref}>{altAction}</Link>
      </p>
      <p className="auth-demo">Демонстрационная форма B1-A · Supabase не подключён</p>
    </div>
  );
}
