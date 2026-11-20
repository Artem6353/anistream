import Image from 'next/image';
import { AuthForm } from '@/components/proto/AuthForm';
import { Pulse } from '@/components/proto/Pulse';

export function CinematicAuth({ mode }: { mode: 'login' | 'register' }) {
  return (
    <div className="c-auth">
      <div className="c-auth-art">
        <Image src="/design/backdrops/02.jpg" alt="" width={1200} height={900} sizes="(max-width: 900px) 100vw, 50vw" priority />
        <div className="c-auth-art-text">
          <span className="c-label" style={{ color: 'rgb(247 245 240 / 70%)' }}>
            <Pulse size={5} /> AniNova · демо
          </span>
          <h2>Ваш сеанс начинается с одной кнопки</h2>
          <p>Каталог открыт без входа. Аккаунт — для истории, закладок и прогресса чтения.</p>
        </div>
      </div>
      <div className="c-auth-panel">
        <div className="c-auth-inner">
          <h1>{mode === 'login' ? 'Вход' : 'Регистрация'}</h1>
          <p>
            {mode === 'login'
              ? 'Введите почту и пароль. Это демонстрационная форма — запрос не отправляется.'
              : 'Никнейм виден в профиле и комментариях. Комиксы в AniNova — только на русском.'}
          </p>
          <AuthForm
            mode={mode}
            altHref={mode === 'login' ? '/cinematic/register' : '/cinematic/login'}
            altLabel={mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
            altAction={mode === 'login' ? 'Создать' : 'Войти'}
          />
        </div>
      </div>
    </div>
  );
}
