'use client';

import { useEffect, useState } from 'react';
import { AuthModal } from './AuthModal';
import { onOpenAuth } from '@/lib/auth-gate';

/** Глобальная точка монтирования AuthModal: открывается событием anistream:open-auth
    из любой точки приложения (лайк/отзыв/список без входа). */
export function AuthGate() {
  const [open, setOpen] = useState(false);
  useEffect(() => onOpenAuth(() => setOpen(true)), []);
  return <AuthModal open={open} onClose={() => setOpen(false)} />;
}
