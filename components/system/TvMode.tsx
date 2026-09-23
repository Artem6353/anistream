'use client';

import { useLibrary } from '@/lib/library';
import { useTvNavigation } from '@/lib/tv/useTvMode';

/** Включает D-pad навигацию согласно настройке пользователя. */
export function TvMode() {
  const { settings } = useLibrary();
  useTvNavigation(settings.tvMode);
  return null;
}
