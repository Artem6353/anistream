import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container">
      <div className="empty-state" style={{ marginTop: 48 }}>
        <h1 style={{ fontSize: 40, fontWeight: 800 }}>404</h1>
        <h2>Такой страницы нет</h2>
        <p>Возможно, тайтл переименовали или ссылка устарела. Попробуйте поиск или начните с каталога.</p>
        <form action="/search" method="GET" style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 420 }}>
          <input className="input" type="search" name="q" placeholder="Поиск по каталогу…" aria-label="Поиск" />
          <button className="btn btn--primary btn--md" type="submit">
            Найти
          </button>
        </form>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link className="btn btn--outline btn--md" href="/catalog">
            В каталог
          </Link>
          <Link className="btn btn--ghost btn--md" href="/">
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
