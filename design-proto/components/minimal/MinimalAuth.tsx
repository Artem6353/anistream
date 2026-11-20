import { AuthForm } from '@/components/proto/AuthForm';
import { Pulse } from '@/components/proto/Pulse';

export function MinimalAuth({ mode }: { mode: 'login' | 'register' }) {
  return (
    <div className="m-wrap">
      <div className="m-auth">
        <div className="m-auth-card">
          <div className="m-auth-head">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: 10,
              }}
            >
              <Pulse size={5} /> AniNova
            </span>
            <h1>{mode === 'login' ? 'Вход в аккаунт' : 'Создать аккаунт'}</h1>
            <p>
              {mode === 'login'
                ? 'Продолжите с того места, где остановились. Публичный каталог доступен и без входа.'
                : 'Аккаунт нужен для истории, закладок и прогресса чтения. Каталог открыт без регистрации.'}
            </p>
          </div>
          <AuthForm
            mode={mode}
            altHref={mode === 'login' ? '/minimal/register' : '/minimal/login'}
            altLabel={mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
            altAction={mode === 'login' ? 'Создать' : 'Войти'}
          />
        </div>
      </div>
    </div>
  );
}
