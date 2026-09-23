import type { Metadata } from 'next';
import { demoWeek } from '@/lib/schedule';
import { ScheduleClient } from '@/components/schedule/ScheduleClient';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Расписание',
  description: 'Недельное расписание выхода серий: живые данные AniList с автообновлением.',
};

export default function SchedulePage() {
  return (
    <div className="container">
      <header className="page-head">
        <h1>Расписание выхода</h1>
        <p>Текущая неделя в вашем часовом поясе: сначала демо-заготовка, затем живые эфиры AniList.</p>
      </header>
      <ScheduleClient mode="week" fallback={demoWeek()} />
    </div>
  );
}
