import Link from 'next/link';
import { Pulse } from '@/components/proto/Pulse';

export function CinematicFooter() {
  return (
    <footer className="c-footer">
      <div className="c-wrap c-footer-in">
        <div>
          <span className="c-logo">
            <Pulse size={6} />
            AniNova
          </span>
          <p className="c-footer-note" style={{ marginTop: 8 }}>
            Прототип B1-A. Демонстрационные данные, обложки и плеер. Production, Supabase и Redis не затронуты.
          </p>
        </div>
        <nav className="c-footer-links" aria-label="Ссылки в подвале">
          <Link href="/cinematic/catalog">Каталог</Link>
          <Link href="/cinematic/comics">Комиксы</Link>
          <Link href="/cinematic/profile">Профиль</Link>
          <Link href="/cinematic/login">Вход</Link>
          <Link href="/cinematic/register">Регистрация</Link>
        </nav>
        <p className="c-footer-note">
          © 2026 AniNova · Nova Cinematic
          <br />
          Комиксы — только на русском
        </p>
      </div>
    </footer>
  );
}
