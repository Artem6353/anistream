'use client';

import { useEffect, useRef, useState } from 'react';
import { concepts, screens, type ConceptId } from '@/lib/site';

const VIEWPORTS = [
  { width: 390, height: 844, label: '390 · смартфон' },
  { width: 768, height: 1024, label: '768 · планшет' },
  { width: 1440, height: 900, label: '1440 · компьютер' },
  { width: 1920, height: 1080, label: '1920 · телевизор' },
];

/* Живой просмотр одного экрана в четырёх ширинах. iframe ленивый: на индексной
   странице не грузится 12 копий приложения сразу. */
export function DevicePreview() {
  const [concept, setConcept] = useState<ConceptId>('minimal');
  const [screenPath, setScreenPath] = useState<string>('');
  const [width, setWidth] = useState(1440);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const vp = VIEWPORTS.find((v) => v.width === width) ?? VIEWPORTS[2];

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1, (el.clientWidth - 32) / vp.width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vp.width]);

  const src = `/${concept}${screenPath}?ui=0`;

  return (
    <div className="pv">
      <div className="pv-bar">
        <label>
          Концепция{' '}
          <select value={concept} onChange={(e) => setConcept(e.target.value as ConceptId)}>
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.letter} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Экран{' '}
          <select value={screenPath} onChange={(e) => setScreenPath(e.target.value)}>
            {screens.map((s) => (
              <option key={s.id} value={s.path}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="pv-seg" role="group" aria-label="Ширина вьюпорта">
          {VIEWPORTS.map((v) => (
            <button key={v.width} type="button" aria-pressed={v.width === width} onClick={() => setWidth(v.width)}>
              {v.width}
            </button>
          ))}
        </div>
        <a href={src} target="_blank" rel="noreferrer">
          открыть отдельно ↗
        </a>
      </div>
      <div className="pv-stage" ref={wrapRef}>
        <div
          className="pv-frame"
          style={{ width: vp.width * scale, height: vp.height * scale }}
          data-viewport={vp.width}
        >
          <iframe
            key={src}
            src={src}
            title={`${concept} — ${screenPath || 'главная'}, ${vp.width}px`}
            width={vp.width}
            height={vp.height}
            loading="lazy"
            style={{ transform: `scale(${scale})` }}
          />
        </div>
      </div>
      <p className="pv-hint">
        {vp.label} · масштаб {Math.round(scale * 100)}% · панель прототипа внутри iframe скрыта (
        <code>?ui=0</code>). Тема переключается внутри концепции и сохраняется в localStorage.
      </p>
    </div>
  );
}
