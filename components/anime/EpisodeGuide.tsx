import type { Title } from '@/lib/types';
import { formatClock } from '@/lib/format';
import { EpisodeGuideRows, type EpisodeGuideRow } from './EpisodeGuideRows';

const MSK = 'Europe/Moscow';

/**
 * График выхода серий под плеером (ТЗ 2.4): № серии, название, дата и время МСК, статус.
 * Для онгоингов — точные даты/время из AniList airingSchedule; для завершённых — статус
 * «вышла» и сезон; названия серий появятся, когда источники их предоставят
 * (AniList/Shikimori не отдают названия серий завершённых тайтлов).
 */
export function EpisodeGuide({ title }: { title: Title }) {
  const now = Date.now();
  const airingRows = (title.airing ?? []).slice().sort((a, b) => a.ep - b.ep);
  const isUp = title.status === 'upcoming';
  const isOn = title.status === 'ongoing';

  let rows: EpisodeGuideRow[] = [];
  if (isUp) {
    rows = [
      {
        ep: '—',
        name: 'Премьера',
        date: title.season ? `${title.season} ${title.year || ''}`.trim() : String(title.year || 'дата не объявлена'),
        time: '',
        status: 'ожидается',
      },
    ];
  } else if (isOn && airingRows.length) {
    rows = airingRows.map((a) => ({
      ep: String(a.ep),
      name: `Episode ${a.ep}`,
      date: new Date(a.at).toLocaleDateString('ru-RU', { timeZone: MSK, day: 'numeric', month: 'long', year: 'numeric' }),
      time: `${formatClock(a.at)} МСК`,
      status: a.at <= now ? 'вышла' : 'ожидается',
    }));
    const maxAired = Math.max(...airingRows.map((a) => a.ep));
    if (maxAired < title.episodes) {
      rows.push({ ep: String(maxAired + 1), name: `Episode ${maxAired + 1}`, date: 'по графику онгоингов', time: '', status: 'ожидается' });
    }
  } else if (isOn) {
    rows = [];
  } else {
    const ed = (title.epdates ?? {}) as Record<string, number>;
    rows = Array.from({ length: Math.min(title.episodes, 60) }, (_, i) => i + 1).map((ep) => {
      const at = ed[String(ep)] ?? ed[ep as unknown as string];
      return {
        ep: String(ep),
        name: `Episode ${ep}`,
        date: at
          ? new Date(at).toLocaleDateString('ru-RU', { timeZone: MSK, day: 'numeric', month: 'long', year: 'numeric' })
          : title.year
            ? `сезон ${title.year}`
            : '—',
        time: at ? `${formatClock(at)} МСК` : '',
        status: 'вышла',
      };
    });
  }

return (
    <section className="epguide" aria-label="График выхода серий">
      <h2 className="section-title">График выхода серий</h2>
      <p className="panel__note">
        {isUp
          ? 'Тайтл ещё не вышел: статус «анонс», дата премьеры приблизительна (сезон выхода по AniList).'
          : isOn
            ? airingRows.length
              ? 'Онгоинг: вышедшие серии с точными датами и временем МСК (AniList); следующие — по графику онгоингов на главной.'
              : 'Онгоинг: точные даты серий подтянутся из AniList автоматически; смотрите график на главной.'
            : Object.keys((title.epdates ?? {}) as Record<string, number>).length
              ? 'Все серии вышли; точные даты и время премьеры серий — по московскому времени (AniList).'
              : `Все серии вышли (${title.year || 'год неизвестен'}). Точные даты дозаполняются скриптом fetch-episode-dates.`}
      </p>
      <EpisodeGuideRows rows={rows} />
      {title.episodes > 60 && !isOn && !isUp ? (
        <p className="panel__note">Показаны первые 60 серий из {title.episodes}.</p>
      ) : null}
    </section>
  );
}
