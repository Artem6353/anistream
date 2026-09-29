'use client';

import Link from 'next/link';
import { Logo } from './Logo';
import { useI18n } from '@/lib/i18n';

/** Компактный футер (ТЗ 4.0, задача 8): бренд + документы + о проекте + нижняя строка. */
export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer footer--compact">
      <div className="container footer__grid">
        <div className="footer__brand">
          <Link className="header__brand" href="/">
            <Logo size={24} />
            {/* S4.2: h2-бренд — «коннектор» цепочки заголовков: с любого последнего
                уровня страницы (h1…h4) переход в h2 валиден (axe heading-order),
                далее h3-колонки → h4/h5/h6 низа; H4–H6 присутствуют на всех страницах. */}
            <h2 className="header__brand-text">AniNova</h2>
          </Link>
          <p>Каталог метаданных аниме: живое расписание, плеер и локальный профиль без регистрации.</p>
        </div>
        <nav className="footer__col" aria-label={t('docs')}>
          {/* S4.2: h3 (не h4): цепочка футера h2→h3→h4/h5/h6 без пропусков */}
          <h3>{t('docs')}</h3>
          <div className="footer__docs">
            <Link href="/privacy">Конфиденциальность</Link>
            <Link href="/terms">Соглашение</Link>
            <Link href="/disclaimer">Дисклеймер</Link>
            <Link href="/dmca">DMCA</Link>
          </div>
        </nav>
        <nav className="footer__col" aria-label={t('about')}>
          {/* S4.2: h3 */}
          <h3>{t('about')}</h3>
          <Link href="/catalog">Каталог</Link>
          <Link href="/schedule">Расписание</Link>
          <Link href="/genres">Жанры</Link>
          <a href="https://anilist.co" target="_blank" rel="noopener noreferrer">
            Метаданные: AniList
          </a>
        </nav>
      </div>
      <div className="container footer__bottom">
        {/* Аудит 30.09 (SEO-7): копирайт/дисклеймер — НЕ заголовки. Прежние h4–h6
            «для цепочки SuperSEO» — семантический мусор: вредит a11y (озвучка
            оглавления скринридером) и выглядит как переоптимизация. */}
        <p>© {new Date().getFullYear()} AniNova. Учебный каталог метаданных и плеер.</p>
        <p className="footer__sources">Видео принадлежит правообладателям.</p>
        <p>Учебный проект: не аффилирован с правообладателями и стримингами.</p>
      </div>
    </footer>
  );
}
