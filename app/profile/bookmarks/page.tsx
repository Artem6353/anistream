import type { Metadata } from 'next';
import { BookmarksList } from '@/components/profile/BookmarksList';
import { ProfileTabs } from '@/components/profile/ProfileTabs';

export const metadata: Metadata = { title: 'Закладки' };

export default function BookmarksPage() {
  return (
    <div className="container">
      <header className="page-head">
        <h1>Профиль</h1>
        <p>Локальный профиль: без регистрации, всё хранится в вашем браузере.</p>
      </header>
      <ProfileTabs />
      <BookmarksList />
    </div>
  );
}
