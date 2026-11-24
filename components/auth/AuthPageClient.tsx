'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { supabaseConfigured } from '@/lib/supabase/env';
import { checkPassword, humanizeAuthError, validateEmail, validatePassword, validateUsername } from '@/lib/auth/validation';
import { mirrorSessionToLegacy } from '@/lib/auth/session-bridge';
import { notifyAuthChange } from '@/lib/auth-gate';
import { useToast } from '@/components/ui/Toaster';
import { IconGoogle } from '@/components/ui/icons';

type Mode = 'login' | 'register';

export interface AuthPageClientProps {
  /** Куда вернуться после входа (внутренний путь, уже провалидированный на сервере). */
  next: string;
  /** Причина редиректа сюда — показываем ненавязчивой подсказкой. */
  reason?: 'protected' | 'expired' | null;
  /** Серверная заготовка: OAuth вернулся с ошибкой (?error=...). */
  oauthError?: string | null;
  /** Preview-страница уже содержит H1 в hero — форма не должна дублировать заголовок. */
  preview?: boolean;
}

const passwordTone = ['ds-meter__fill--weak', 'ds-meter__fill--weak', 'ds-meter__fill--meh', 'ds-meter__fill--ok', 'ds-meter__fill--strong'];

/** Форма входа и регистрации (Supabase Auth: email+пароль и Google OAuth). */
export function AuthPageClient({ next, reason, oauthError, preview = false }: AuthPageClientProps) {
  const router = useRouter();
  const Title = preview ? 'h2' : 'h1';
  const toast = useToast();
  const configured = supabaseConfigured();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  // Ошибку OAuth приносит сервер в query — это начальное состояние, а не эффект.
  const [formError, setFormError] = useState<string | null>(oauthError ? humanizeAuthError(oauthError) : null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string | null; password?: string | null; username?: string | null }>({});
  const [sentTo, setSentTo] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const strength = useMemo(() => checkPassword(password), [password]);

  useEffect(() => {
    // B2-C: на узком preview-экране автофокус прокручивал страницу сразу к форме,
    // и заголовок с преимуществами оставался выше вьюпорта.
    if (preview && !window.matchMedia('(min-width: 900px)').matches) return;
    emailRef.current?.focus({ preventScroll: preview });
  }, [mode, preview]);

  const finish = useCallback(
    (message: string) => {
      notifyAuthChange();
      toast(message);
      router.replace(next);
      router.refresh();
    },
    [next, router, toast],
  );

  const onEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFormError(null);

    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const usernameError = mode === 'register' ? validateUsername(username) : null;
    setFieldErrors({ email: emailError, password: passwordError, username: usernameError });
    if (emailError || passwordError || usernameError) return;

    const supabase = getBrowserSupabase();
    if (!supabase) {
      setFormError('Вход не настроен: в проекте нет NEXT_PUBLIC_SUPABASE_URL/ANON_KEY');
      return;
    }

    setBusy('email');
    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          setFormError(humanizeAuthError(error.message, error.code));
          return;
        }
        mirrorSessionToLegacy(data.session);
        finish('Вход выполнен — добро пожаловать!');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { username: username.trim() },
            emailRedirectTo:
              typeof window !== 'undefined'
                ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
                : undefined,
          },
        });
        if (error) {
          setFormError(humanizeAuthError(error.message, error.code));
          return;
        }
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          /* Supabase не раскрывает существование аккаунта: возвращает «успех» с пустым
             identities. Пользователю важнее подсказка, чем антиэнумерация на своей форме. */
          setFormError('Этот email уже зарегистрирован — войдите или восстановите пароль');
          setMode('login');
          return;
        }
        if (data.session) {
          mirrorSessionToLegacy(data.session);
          finish('Аккаунт создан');
        } else {
          // Supabase требует подтверждение email — это нормальный сценарий, не ошибка.
          setSentTo(email.trim());
        }
      }
    } catch (error) {
      setFormError(humanizeAuthError(error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(null);
    }
  };

  const onGoogle = async () => {
    if (busy) return;
    setFormError(null);
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setFormError('Вход через Google не настроен: нет ключей Supabase');
      return;
    }
    setBusy('google');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) {
        setFormError(humanizeAuthError(error.message, error.code));
        setBusy(null);
      }
      // Успех — полный редирект на Google, поэтому busy не сбрасываем.
    } catch (error) {
      setFormError(humanizeAuthError(error instanceof Error ? error.message : String(error)));
      setBusy(null);
    }
  };

  if (!configured) {
    return (
      <div className="ds-card ds-card--pad auth-card">
        <Title className="auth-card__title">Вход пока не настроен</Title>
        <p className="ds-muted">
          В этой сборке нет <code>NEXT_PUBLIC_SUPABASE_URL</code> и <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          Добавьте их в <code>.env.local</code> (или в панели Vercel) и перезапустите приложение.
        </p>
        <Link className="ds-btn ds-btn--ghost" href={preview ? '/preview/aninova-3' : '/'}>
          На главную
        </Link>
      </div>
    );
  }

  if (sentTo) {
    return (
      <div className="ds-card ds-card--pad auth-card">
        <div className="auth-card__badge" aria-hidden="true">✉️</div>
        <Title className="auth-card__title">Проверьте почту</Title>
        <p className="ds-muted">
          Мы отправили письмо на <strong>{sentTo}</strong>. Перейдите по ссылке из него — и вы внутри.
        </p>
        <div className="auth-card__row">
          <button type="button" className="ds-btn ds-btn--ghost" onClick={() => setSentTo(null)}>
            Изменить email
          </button>
          <button type="button" className="ds-btn ds-btn--primary" onClick={() => setMode('login')}>
            У меня уже есть аккаунт
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-card ds-card--pad auth-card">
      <header className="auth-card__head">
        <Title className="auth-card__title">{mode === 'login' ? 'С возвращением' : 'Создать аккаунт'}</Title>
        <p className="ds-muted">
          {mode === 'login'
            ? 'Списки, история и прогресс синхронизируются между устройствами.'
            : 'Один аккаунт — списки, история просмотров, достижения и AniDNA.'}
        </p>
      </header>

      {reason === 'protected' && (
        <p className="auth-card__hint" role="status">
          Личный кабинет доступен после входа.
        </p>
      )}
      {reason === 'expired' && (
        <p className="auth-card__hint" role="status">
          Сессия истекла — войдите снова.
        </p>
      )}
      {formError && (
        <p className="auth-card__error" role="alert">
          {formError}
        </p>
      )}

      <div className="ds-segment" role="tablist" aria-label="Режим формы">
        {(['login', 'register'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={`ds-segment__item${mode === m ? ' is-active' : ''}`}
            onClick={() => {
              setMode(m);
              setFormError(null);
              setFieldErrors({});
            }}
          >
            {m === 'login' ? 'Вход' : 'Регистрация'}
          </button>
        ))}
      </div>

      <button type="button" className="ds-btn ds-btn--google" onClick={onGoogle} disabled={busy !== null}>
        {busy === 'google' ? <span className="ds-spinner" aria-hidden="true" /> : <IconGoogle size={18} />}
        Продолжить с Google
      </button>

      <div className="auth-card__divider" role="separator" aria-label="или по email">
        <span>или по email</span>
      </div>

      <form className="auth-form" onSubmit={onEmailSubmit} noValidate>
        {mode === 'register' && (
          <label className="ds-field">
            <span className="ds-field__label">Ник</span>
            <input
              className={`ds-input${fieldErrors.username ? ' has-error' : ''}`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => setFieldErrors((f) => ({ ...f, username: validateUsername(username) }))}
              autoComplete="nickname"
              placeholder="kirito_fan"
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={fieldErrors.username ? 'username-error' : undefined}
            />
            {fieldErrors.username ? (
              <span className="ds-field__error" id="username-error">{fieldErrors.username}</span>
            ) : (
              <span className="ds-field__hint">3–24 символа: латиница, цифры, «_», «-»</span>
            )}
          </label>
        )}

        <label className="ds-field">
          <span className="ds-field__label">Email</span>
          <input
            ref={emailRef}
            type="email"
            className={`ds-input${fieldErrors.email ? ' has-error' : ''}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setFieldErrors((f) => ({ ...f, email: validateEmail(email) }))}
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          />
          {fieldErrors.email && (
            <span className="ds-field__error" id="email-error">{fieldErrors.email}</span>
          )}
        </label>

        <label className="ds-field">
          <span className="ds-field__label">Пароль</span>
          <span className="ds-input-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              className={`ds-input${fieldErrors.password ? ' has-error' : ''}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setFieldErrors((f) => ({ ...f, password: validatePassword(password) }))}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={mode === 'register' || fieldErrors.password ? 'password-help' : undefined}
            />
            <button
              type="button"
              className="ds-input__action"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </span>
          {mode === 'register' ? (
            <span className="ds-field__hint" id="password-help">
              <span className="ds-meter" aria-hidden="true">
                <span className={`ds-meter__fill ${passwordTone[strength.score]}`} style={{ width: `${(strength.score / 4) * 100}%` }} />
              </span>
              {fieldErrors.password ?? (password ? passwordToneLabel(strength.score) : 'Минимум 8 символов, буква и цифра')}
            </span>
          ) : (
            fieldErrors.password && <span className="ds-field__error" id="password-help">{fieldErrors.password}</span>
          )}
        </label>

        <button type="submit" className="ds-btn ds-btn--primary ds-btn--block" disabled={busy !== null}>
          {busy === 'email' && <span className="ds-spinner" aria-hidden="true" />}
          {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>
      </form>

      <p className="auth-card__foot ds-muted">
        {mode === 'login' ? (
          <>
            Нет аккаунта?{' '}
            <button type="button" className="auth-card__link" onClick={() => setMode('register')}>
              Зарегистрируйтесь
            </button>
          </>
        ) : (
          <>
            Уже есть аккаунт?{' '}
            <button type="button" className="auth-card__link" onClick={() => setMode('login')}>
              Войти
            </button>
          </>
        )}
      </p>
    </div>
  );
}

function passwordToneLabel(score: number): string {
  if (score <= 1) return 'Слабый пароль';
  if (score === 2) return 'Так себе — добавьте цифру';
  if (score === 3) return 'Хороший пароль';
  return 'Отличный пароль';
}
