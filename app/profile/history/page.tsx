import type { Metadata } from 'next';
import { HistoryList } from '@/components/profile/HistoryList';
import { ProfileTabs } from '@/components/profile/ProfileTabs';

export const metadata: Metadata = { title: 'История просмотров' };

export default function HistoryPage() {
  return (
    <div className="container">
      <header className="page-head">
        <h1>Профиль</h1>
        <p>История просмотров с прогрессом: продолжите с того же места на любой странице.</p>
      </header>
      <ProfileTabs />
      <HistoryList />
    </div>
  );
}
