'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useFocusTrap } from './remote/focus';
import { useA3Ui } from './A3Ui';
import {
  IconGrid, IconHome, IconFilm, IconUser, IconX, IconSettings, IconSearch,
  IconStar, IconCalendar, IconList, IconBookmark, IconClock,
} from '@/components/ui/icons';
import { A3_ACCOUNT_NAV, A3_LEGAL_NAV, A3_NAV, A3_ROOT as ROOT, A3_SEARCH_PATH, A3_UTILITY_NAV } from '@/lib/aninova3/nav';

const PRIMARY_ICONS = {
  [`${ROOT}`]: IconHome,
  [`${ROOT}/catalog`]: IconGrid,
  [`${ROOT}/schedule`]: IconCalendar,
  [`${ROOT}/comics`]: IconFilm,
} as Record<string, typeof IconHome>;

const UTILITY_ICONS = [IconStar, IconGrid, IconCalendar, IconList];
const ACCOUNT_ICONS = [IconUser, IconSettings, IconBookmark, IconUser];

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
              <Link className="a3-menu__item" href={A3_SEARCH_PATH} onClick={close}>
                <IconSearch size={20} />
                <span>Поиск по каталогу</span>
              </Link>
              {A3_NAV.slice(0, 4).map((item) => {
                const Icon = PRIMARY_ICONS[item.href] ?? IconGrid;
                return (
                  <Link key={item.href} className="a3-menu__item" href={item.href} onClick={close}>
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <p className="a3-menu__group">Каталог</p>
            <nav className="a3-menu__list" aria-label="Каталог и подборки">
              {A3_UTILITY_NAV.map((item, i) => {
                const Icon = UTILITY_ICONS[i] ?? IconGrid;
                return (
                  <Link key={item.href} className="a3-menu__item" href={item.href} onClick={close}>
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <p className="a3-menu__group">Аккаунт</p>
            <nav className="a3-menu__list" aria-label="Аккаунт">
              {A3_ACCOUNT_NAV.map((item, i) => {
                const Icon = ACCOUNT_ICONS[i] ?? IconUser;
                return (
                  <Link key={item.href} className="a3-menu__item" href={item.href} onClick={close}>
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <p className="a3-menu__group">Документы</p>
            <nav className="a3-menu__list" aria-label="Правовые документы">
              {A3_LEGAL_NAV.map((item) => (
                <Link key={item.href} className="a3-menu__item" href={item.href} onClick={close}>
                  <IconClock size={20} />
                  <span>{item.label}</span>
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
            <p className="a3-muted">Preview B2-D: интерфейс за флагом, данные — реальный каталог и API.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
