'use client';

import Script from 'next/script';
import { useEffect, useRef } from 'react';

/** S5 (PLAN-seo-perf 28.09): Яндекс.Метрика — next/script strategy=lazyOnload
    (не конкурирует с LCP/TBT). Цели: pageview — автоматически (ssr:true),
    «search» — окно-событие aninova:goal из SearchForm; цели, достигшиеся до
    загрузки тега, буферизуются и отправляются в onReady.
    Без NEXT_PUBLIC_METRIKA_ID компонент не рендерит ничего; CSP открывает
    mc.yandex.ru только при установленном ID (next.config.ts). */

const ID = process.env.NEXT_PUBLIC_METRIKA_ID;

declare global {
  interface Window {
    ym?: (...args: unknown[]) => void;
  }
}

export function Metrika() {
  const ready = useRef(false);
  const queue = useRef<string[]>([]);

  useEffect(() => {
    if (!ID) return;
    const onGoal = (e: Event) => {
      const goal = (e as CustomEvent<string>).detail;
      if (ready.current) window.ym?.(Number(ID), 'reachGoal', goal);
      else queue.current.push(goal);
    };
    window.addEventListener('aninova:goal', onGoal);
    return () => window.removeEventListener('aninova:goal', onGoal);
  }, []);

  if (!ID) return null;

  return (
    <>
      <Script
        id="metrika-tag"
        strategy="lazyOnload"
        onReady={() => {
          ready.current = true;
          while (queue.current.length) {
            window.ym?.(Number(ID), 'reachGoal', queue.current.shift()!);
          }
        }}
      >
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t);a=e.getElementsByTagName(t)[0];k.async=1;k.src=r;a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');
ym(${ID},'init',{ssr:true,webvisor:true,clickmap:true,ecommerce:'dataLayer',accurateTrackBounce:true,trackLinks:true});`}
      </Script>
      {/* noscript-фолбэк из официального сниппета: пиксель-watch для клиентов без JS */}
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${ID}`}
            style={{ position: 'absolute', left: '-9999px' }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
