import type { Metadata } from 'next';
import { MyList } from '@/components/profile/MyList';
import { ProfileTabs } from '@/components/profile/ProfileTabs';

export const metadata: Metadata = { title: 'Мой список' };

export default function ListPage() {
  return (
    <div className="container">
      <header className="page-head">
        <h1>Профиль</h1>
        <p>Локальные списки просмотра: смотрю, просмотрено, отложено, брошено, запланировано, пересматриваю.</p>
      </header>
      <ProfileTabs />
      <MyList />
    </div>
  );
}
