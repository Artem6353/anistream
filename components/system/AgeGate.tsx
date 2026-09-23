'use client';

import { useEffect, useState } from 'react';

/** Возрастной гейт (A1.4): для 18+ тайтлов, флаг в localStorage. */
export function AgeGate({ adult }: { adult: boolean }) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (adult && !localStorage.getItem('anistream:age_ok')) setBlocked(true);
  }, [adult]);
  if (!blocked) return null;
  return (
    <div className="agegate" role="dialog" aria-modal="true" aria-label="Подтверждение возраста">
      <div className="agegate__box">
        <h2>Материалы для взрослых</h2>
        <p>Этот тайтл помечен как 18+. Подтвердите, что вам исполнилось 18 лет.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn--primary btn--md"
            onClick={() => {
              localStorage.setItem('anistream:age_ok', '1');
              setBlocked(false);
            }}
          >
            Мне есть 18
          </button>
          <a className="btn btn--outline btn--md" href="/catalog">
            Уйти в каталог
          </a>
        </div>
      </div>
    </div>
  );
}
