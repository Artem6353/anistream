import type { Metadata } from 'next';
import { getWeekSchedule } from '@/lib/schedule';
import { ScheduleClient } from '@/components/schedule/ScheduleClient';

/* ТЗ 1.1: 3600 → 600. Расписание обновляется воркером каждые 30 минут,
   часовая ревалидация показывала вчерашнюю сетку. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Расписание выхода серий аниме',
  /* Раньше обещало «живые данные AniList»: после ТЗ 1.1 рантайм AniList не опрашивает,
     сетка приходит из таблицы airing_schedule (воркер, каждые 30 минут). */
  description:
    'Недельное расписание выхода серий аниме: дни, номера серий и время эфира по Москве. Сетка обновляется автоматически каждые 30 минут.',
  alternates: { canonical: '/schedule' },
  openGraph: { type: 'website', url: '/schedule', locale: 'ru_RU', siteName: 'AniNova', images: '/opengraph-image' },
};

export default async function SchedulePage() {
  /* SSR отдаёт реальные данные из БД (воркер sync-airing), клиент только освежает их.
     Никакой демо-заготовки: раньше именно она показывала «One Piece серия 5» в неделю,
     когда AniList отвечал 429 на общих IP Vercel. */
  const { entries, source, freshAt } = await getWeekSchedule();
  return (
    <div className="container">
      <header className="page-head">
        <h1>Расписание выхода</h1>
        <p>Текущая неделя по московскому времени: дни, номера серий и время эфира.</p>
      </header>
      <ScheduleClient mode="week" fallback={entries} source={source} freshAt={freshAt} />
    </div>
  );
}
