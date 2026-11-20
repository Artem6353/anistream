'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { concepts, screens } from '@/lib/site';
import { Pulse } from './Pulse';
import { ThemeToggle } from './ThemeToggle';

/* Панель прототипа: не часть дизайна концепций, а инструмент сравнения.
   Скрывается по ?ui=0 (скриншоты), кнопкой или клавишей «d».
   Переключение A/B/C сохраняет текущий экран — это и есть «рабочая навигация
   между прототипами». */
export function ProtoDock() {
  const pathname = usePathname() || '/';
  const [, first, ...rest] = pathname.split('/');
  const concept = concepts.find((c) => c.id === first);
  const suffix = '/' + rest.join('/');
  const screen = screens.find((s) => s.path === suffix) ?? screens.find((s) => s.path !== '' && suffix.startsWith(s.path));
  const tail = screen ? screen.path : '';

  const hide = () => {
    document.documentElement.dataset.ui = 'off';
    try {
      sessionStorage.setItem('aninova-proto-ui', 'off');
    } catch {
      /* noop */
    }
  };

  return (
    <aside className="dock" aria-label="Панель прототипа AniNova 3.0">
      <span className="dock-badge">
        <Pulse size={6} /> B1-A
      </span>
      <span className="dock-sep" aria-hidden="true" />
      <span className="dock-label">Концепция</span>
      <div className="dock-switch" role="group" aria-label="Переключить концепцию">
        {concepts.map((c) => {
          const active = concept?.id === c.id;
          return (
            <Link
              key={c.id}
              href={`${c.path}${tail}`}
              className={`dock-tab${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={`${c.name} — ${c.ru}`}
            >
              {c.letter}
            </Link>
          );
        })}
      </div>
      <span className="dock-sep" aria-hidden="true" />
      <Link className="dock-link" href="/">
        Экраны
      </Link>
      <ThemeToggle className="dock-icon" />
      <button type="button" className="dock-icon" onClick={hide} aria-label="Скрыть панель прототипа">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" stroke="currentColor" strokeWidth="2" fill="none">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </aside>
  );
}
