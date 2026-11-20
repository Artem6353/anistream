'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useFocusTrap } from './remote/focus';
import { useA3Ui } from './A3Ui';
import { IconGrid, IconHome, IconFilm, IconUser, IconX, IconSettings } from '@/components/ui/icons';

const ROOT = '/preview/aninova-3';

const LINKS = [
  { href: ROOT, label: 'Главная', icon: IconHome },
  { href: `${ROOT}/catalog`, label: 'Каталог аниме', icon: IconGrid },
  { href: `${ROOT}/comics`, label: 'Comics · только RU', icon: IconFilm },
  { href: `${ROOT}/profile`, label: 'Профиль и история', icon: IconUser },
  { href: `${ROOT}/auth`, label: 'Вход и регистрация', icon: IconSettings },
];

/** Мобильное меню-лист: разделы всегда доступны, фокус удерживается внутри. */
export function A3Menu() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { tv, setTv } = useA3Ui();
  useFocusTrap(panel, open, '.a3-menu__item');

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        className="a3-iconbtn a3-menubtn"
        type="button"
        aria-expanded={open}
        aria-controls="a3-menu"
        aria-label="Меню разделов"
        onClick={() => setOpen(true)}
      >
        <IconGrid size={18} />
      </button>
      {open ? (
        <div
          className="a3-overlay a3-menu"
          data-a3-overlay="true"
          role="dialog"
          aria-modal="true"
          aria-label="Меню разделов"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
          }}
        >
          <div className="a3-menu__panel" id="a3-menu" ref={panel}>
            <div className="a3-menu__head">
              <p className="a3-h2">Разделы</p>
              <button className="a3-iconbtn" type="button" onClick={close} aria-label="Закрыть меню">
                <IconX size={18} />
              </button>
            </div>
            <nav className="a3-menu__list" aria-label="Разделы">
              {LINKS.map(({ href, label, icon: Icon }) => (
                <Link key={href} className="a3-menu__item" href={href} onClick={close}>
                  <Icon size={20} />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
            <label className="a3-switch a3-menu__tv">
              <span>
                <strong>ТВ-режим</strong>
                <span className="a3-muted">Крупные цели и управление стрелками</span>
              </span>
              <input type="checkbox" checked={tv} onChange={(e) => setTv(e.target.checked)} />
            </label>
            <p className="a3-muted">Preview B1-B: интерфейс за флагом, данные — реальный каталог.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
