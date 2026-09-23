'use client';

import { useEffect, useState } from 'react';

/** Cookie-баннер (A1.3): показывается один раз, флаг в localStorage. */
export function CookieConsent() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem('anistream:cookies')) setShow(true);
  }, []);
  if (!show) return null;
  return (
    <div className="cookie-banner" role="dialog" aria-label="Согласие на cookie">
      <p>Мы используем cookie и localStorage для работы сайта и аналитики. Подробности — в политике конфиденциальности.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn--primary btn--sm"
          onClick={() => {
            localStorage.setItem('anistream:cookies', '1');
            setShow(false);
          }}
        >
          Принять
        </button>
        <a className="btn btn--ghost btn--sm" href="/privacy">
          Подробнее
        </a>
      </div>
    </div>
  );
}
