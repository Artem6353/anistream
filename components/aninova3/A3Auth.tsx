'use client';

import { useState } from 'react';
import Link from 'next/link';
import { IconCheck } from '@/components/ui/icons';

type Mode = 'login' | 'register';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function A3Auth({ initialMode = 'login' }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (mode === 'register' && name.trim().length < 2) next.name = 'Укажите имя — минимум 2 символа.';
    if (!EMAIL.test(email.trim())) next.email = 'Проверьте адрес: нужен формат name@example.com.';
    if (password.length < 8) next.password = 'Пароль — минимум 8 символов.';
    if (mode === 'register' && !consent) next.consent = 'Нужно согласие на обработку данных.';
    setErrors(next);
    setDone(Object.keys(next).length === 0);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setDone(false);
  };

  return (
    <div className="a3-auth">
      <div className="a3-auth__card">
        <p className="a3-kicker">Аккаунт AniNova</p>
        <h1 className="a3-h1">{mode === 'login' ? 'Вход' : 'Регистрация'}</h1>
        <p className="a3-muted">Локальный макет формы. Реальные аккаунты и Supabase не подключены — действующий вход остаётся на текущем сайте.</p>

        <div className="a3-auth__tabs" role="tablist" aria-label="Вход или регистрация">
          <button
            role="tab"
            type="button"
            aria-selected={mode === 'login'}
            className={`a3-auth__tab${mode === 'login' ? ' is-on' : ''}`}
            onClick={() => switchMode('login')}
          >
            Вход
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={mode === 'register'}
            className={`a3-auth__tab${mode === 'register' ? ' is-on' : ''}`}
            onClick={() => switchMode('register')}
          >
            Регистрация
          </button>
        </div>

        <form className="a3-auth__form" onSubmit={submit} noValidate>
          {mode === 'register' ? (
            <label className="a3-field">
              <span className="a3-field__label">Имя</span>
              <input
                className={`a3-input${errors.name ? ' is-invalid' : ''}`}
                name="name"
                autoComplete="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'a3-err-name' : undefined}
              />
              {errors.name ? (
                <span className="a3-field__error" id="a3-err-name" role="alert">
                  {errors.name}
                </span>
              ) : null}
            </label>
          ) : null}

          <label className="a3-field">
            <span className="a3-field__label">Email</span>
            <input
              className={`a3-input${errors.email ? ' is-invalid' : ''}`}
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'a3-err-email' : undefined}
            />
            {errors.email ? (
              <span className="a3-field__error" id="a3-err-email" role="alert">
                {errors.email}
              </span>
            ) : null}
          </label>

          <label className="a3-field">
            <span className="a3-field__label">Пароль</span>
            <span className="a3-inputrow">
              <input
                className={`a3-input${errors.password ? ' is-invalid' : ''}`}
                type={show ? 'text' : 'password'}
                name="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'a3-err-pass' : undefined}
              />
              <button className="a3-inputrow__btn" type="button" aria-pressed={show} onClick={() => setShow(!show)}>
                {show ? 'Скрыть' : 'Показать'}
              </button>
            </span>
            {errors.password ? (
              <span className="a3-field__error" id="a3-err-pass" role="alert">
                {errors.password}
              </span>
            ) : null}
          </label>

          {mode === 'register' ? (
            <label className="a3-check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={!!errors.consent} />
              <span>Согласен на обработку данных по правилам сайта. Это демо-форма, данные никуда не отправляются.</span>
            </label>
          ) : null}
          {errors.consent ? (
            <p className="a3-field__error" role="alert">
              {errors.consent}
            </p>
          ) : null}

          <button className="a3-btn a3-btn--primary a3-btn--lg a3-auth__submit" type="submit">
            {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>

          {done ? (
            <p className="a3-auth__ok" role="status">
              <IconCheck size={16} /> Проверка пройдена. Это макет: реальный вход — <Link href="/auth">на текущем сайте</Link>.
            </p>
          ) : null}
        </form>

        <p className="a3-muted a3-auth__foot">
          {mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
          <button className="a3-link" type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </p>
      </div>
      <aside className="a3-auth__aside">
        <p className="a3-kicker">Почему без пароля в демо</p>
        <p>
          B1-B не меняет действующую авторизацию. Форма показывает правила A: видимые метки, ошибки рядом с полем, показ пароля, согласие. Отправка
          отключена — никаких запросов и записей.
        </p>
        <Link className="a3-btn a3-btn--ghost" href="/auth">
          Перейти к действующему входу
        </Link>
      </aside>
    </div>
  );
}
