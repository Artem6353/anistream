import { AuthForm } from '@/components/proto/AuthForm';
import { Pulse } from '@/components/proto/Pulse';

export function EditorialAuth({ mode }: { mode: 'login' | 'register' }) {
  return (
    <div className="e-wrap">
      <div className="e-auth">
        <div className="e-auth-grid">
          <div className="e-auth-side">
            <span className="e-label">
              <Pulse size={5} /> {mode === 'login' ? 'Вход · выпуск №04' : 'Подписка на выпуск'}
            </span>
            <h1>
              {mode === 'login'
                ? 'Ваша история просмотров живёт здесь'
                : 'Аккаунт — это ваша закладка в выпуске'}
            </h1>
            <p>
              {mode === 'login'
                ? 'Аккаунт нужен только для личного: история, закладки, прогресс чтения. Каталог и комиксы открыты без входа.'
                : 'Публичный каталог не требует регистрации. Аккаунт добавляет историю, списки и синхронизацию прогресса между устройствами.'}
            </p>
            <blockquote className="e-pullquote">
              «Мы не просим почту, чтобы показать вам расписание».
              <cite>Принцип B1-A</cite>
            </blockquote>
            <p className="e-label">
              Демо-форма: данные не отправляются, Supabase не подключён, письма не уходят.
            </p>
          </div>

          <div className="e-auth-card">
            <h2>{mode === 'login' ? 'Войти' : 'Регистрация'}</h2>
            <AuthForm
              mode={mode}
              altHref={mode === 'login' ? '/editorial/register' : '/editorial/login'}
              altLabel={mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
              altAction={mode === 'login' ? 'Создать' : 'Войти'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
