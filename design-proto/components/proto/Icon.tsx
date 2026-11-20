import type { ReactNode } from 'react';

/* Иконки прототипа: 24×24, stroke 1.6 — без внешних icon-библиотек,
   чтобы не тянуть зависимость ради 20 глифов (требование «минимальный JS»). */
export type IconName =
  | 'search'
  | 'close'
  | 'menu'
  | 'left'
  | 'right'
  | 'down'
  | 'play'
  | 'pause'
  | 'volume'
  | 'fullscreen'
  | 'bookmark'
  | 'user'
  | 'sun'
  | 'moon'
  | 'clock'
  | 'star'
  | 'check'
  | 'book'
  | 'grid'
  | 'list'
  | 'arrow'
  | 'external'
  | 'settings'
  | 'eye'
  | 'home';

const paths: Record<IconName, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  left: <path d="M15 18l-6-6 6-6" />,
  right: <path d="M9 6l6 6-6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  play: <path d="M8 5.5 19 12 8 18.5z" />,
  pause: <path d="M9 5.5v13M15 5.5v13" />,
  volume: (
    <>
      <path d="M11 5.5 6.5 9H3v6h3.5L11 18.5z" />
      <path d="M15 9.5a3.6 3.6 0 0 1 0 5M17.6 7a7 7 0 0 1 0 10" />
    </>
  ),
  fullscreen: <path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" />,
  bookmark: <path d="M6.5 3.5h11v17l-5.5-4-5.5 4z" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20.5c.6-3.8 3.7-6 7.5-6s6.9 2.2 7.5 6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.4l3.4 2" />
    </>
  ),
  star: <path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8 6.9 19.5l1-5.7-4.1-4 5.7-.8z" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  book: (
    <>
      <path d="M4 4.5h6.5A2.5 2.5 0 0 1 13 7v13a2 2 0 0 0-2-2H4z" />
      <path d="M20 4.5h-6.5A2.5 2.5 0 0 0 11 7v13a2 2 0 0 1 2-2h7z" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  list: <path d="M4 7h16M4 12h16M4 17h11" />,
  arrow: <path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5" />,
  external: <path d="M14 4h6v6M20 4l-8 8M18 14v6H4V6h6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
    </>
  ),
  home: <path d="M4 10.6 12 4l8 6.6V20h-5.5v-5.8h-5V20H4z" />,
  eye: (
    <>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.6,
  className,
  filled = false,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
