'use client';

import { useEffect, useState } from 'react';

/** Метрики registry в админке (hit/miss, latency p50/p95, ошибки за час). */
export function MetricsPanel() {
  const [m, setM] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    fetch('/api/metrics')
      .then((r) => (r.ok ? r.json() : null))
      .then(setM)
      .catch(() => {});
  }, []);
  if (!m) return null;
  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <h2 className="section-title">Метрики источников</h2>
      <p className="panel__note">
        cache hit {m.cacheHit} / miss {m.cacheMiss} · live ok {m.liveOk} / fail {m.liveFail} · synth {m.synth} · guess{' '}
        {m.guess} · demo {m.demo} · latency p50 {m.latencyP50} ms / p95 {m.latencyP95} ms · ошибок за час {m.errorsThisHour}
      </p>
    </section>
  );
}
