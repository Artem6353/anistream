import type { Metadata } from 'next';
import { A3Profile } from '@/components/aninova3/A3Profile';

export const metadata: Metadata = { title: 'Профиль' };

export default function A3ProfilePage() {
  return (
    <div className="a3-wrap">
      <A3Profile />
    </div>
  );
}
