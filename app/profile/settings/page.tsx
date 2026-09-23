import type { Metadata } from 'next';
import { SettingsPanel } from '@/components/profile/SettingsPanel';
import { ProfileTabs } from '@/components/profile/ProfileTabs';

export const metadata: Metadata = { title: 'Настройки' };

export default function SettingsPage() {
  return (
    <div className="container">
      <header className="page-head">
        <h1>Профиль</h1>
        <p>Настройки плеера и внешнего вида применяются мгновенно и хранятся локально.</p>
      </header>
      <ProfileTabs />
      <SettingsPanel />
    </div>
  );
}
