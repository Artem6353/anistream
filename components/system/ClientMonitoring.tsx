'use client';

import { useEffect } from 'react';
import { initClientMonitoring, injectAnalyticsScript } from '@/lib/monitor';

export function ClientMonitoring() {
  useEffect(() => {
    initClientMonitoring();
    injectAnalyticsScript();
  }, []);
  return null;
}
