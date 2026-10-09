'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

const ContinueWatchingRail = dynamic(
  () => import('@/components/anime/ContinueWatchingRail').then((m) => m.ContinueWatchingRail),
  { ssr: false },
);
const ForYouRail = dynamic(
  () => import('@/components/anime/ForYouRail').then((m) => m.ForYouRail),
  { ssr: false },
);
const BecauseRail = dynamic(
  () => import('@/components/anime/BecauseRail').then((m) => m.BecauseRail),
  { ssr: false },
);
const DiscussedRail = dynamic(
  () => import('@/components/home/DiscussedRail').then((m) => m.DiscussedRail),
  { ssr: false },
);
const TopTabs = dynamic(
  () => import('@/components/home/TopTabs').then((m) => m.TopTabs),
  { ssr: false },
);

type DeferredKind = 'continue' | 'for-you' | 'because' | 'discussed' | 'top';

export function DeferredHomeRail({
  kind,
  week,
  all,
}: {
  kind: DeferredKind;
  week?: string[];
  all?: string[];
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (active) return;
    const target = targetRef.current;
    if (!target) return;

    if (!('IntersectionObserver' in window)) {
      const timer = setTimeout(() => setActive(true), 0);
      return () => clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [active]);

  let content = null;
  if (active) {
    switch (kind) {
      case 'continue':
        content = <ContinueWatchingRail />;
        break;
      case 'for-you':
        content = <ForYouRail />;
        break;
      case 'because':
        content = <BecauseRail />;
        break;
      case 'discussed':
        content = <DiscussedRail />;
        break;
      case 'top':
        content = <TopTabs week={week ?? []} all={all ?? []} />;
        break;
    }
  }

  return (
    <div ref={targetRef} className={active ? 'deferred-home-rail is-loaded' : 'deferred-home-rail'}>
      {content}
    </div>
  );
}
