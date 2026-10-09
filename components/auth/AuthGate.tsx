'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { onOpenAuth } from '@/lib/auth-gate';

const AuthModal = dynamic(() => import('./AuthModal').then((m) => m.AuthModal), { ssr: false });

/** Глобальная точка монтирования AuthModal: открывается событием anistream:open-auth
    из любой точки приложения (лайк/отзыв/список без входа). */
export function AuthGate() {
  const [open, setOpen] = useState(false);
  useEffect(() => onOpenAuth(() => setOpen(true)), []);
  return open ? <AuthModal open onClose={() => setOpen(false)} /> : null;
}
