import type { Title } from '@/lib/types';
import { formatClock } from '@/lib/format';
import { episodeCount, episodeInfo } from '@/lib/episodes';
import { episodeDataFor, type EpisodeData } from '@/lib/episode-data';

/** Итог объявлен источником (для строки «следующая серия ожидается»). */
const episodeInfoTotal = (t: Title) => episodeInfo(t).total;
import { EpisodeGuideRows, type EpisodeGuideRow } from './EpisodeGuideRows';

const MSK = 'Europe/Moscow';

/** Название серии: реальное из источника (таблица `episodes`), иначе русское «Серия N».
    Раньше везде было «Episode N» — англицизм без данных (ТЗ 1.3). */
function epName(names: Record<string, string> | undefined, ep: number): string {
  const real = names ? (names[String(ep)] ?? names[ep as unknown as string]) : undefined;
  return real && real.trim() ? real.trim() : `Серия ${ep}`;
}

/**
 * График выхода серий под плеером (ТЗ 2.4): № серии, название, дата и время МСК, статус.
 *
 * Аудит 2026-10 (ТЗ 1.3): названия/даты приходят пропсом из таблицы `episodes`
 * (lib/episode-data.ts), а не только из `airing`/`epdates` внутри titles.json —
 * те не обновлялись с импорта, из-за чего график «Ван-Пис» в октябре 2026 показывал
 * апрель–июнь 2025 года. Нет названия → «Серия N», а не «Episode N».
 */
export async function EpisodeGuide({ title, data }: { title: Title; data?: EpisodeData | null }) {
  /* RSC: сами добираем данные серий из таблицы `episodes`, если страница их не передала. */
  const epData = data ?? (await episodeDataFor(title));
  /* Серверный компонент (RSC): Date.now() фиксируется на момент ISR-ревалидации —
     это штатный паттерн, «нечистота» здесь осознанная (обновление раз в revalidate). */
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const names = epData?.names ?? title.episodeNames;
  const airingRows = (title.airing ?? []).slice().sort((a, b) => a.ep - b.ep);
  const isUp = title.status === 'upcoming';
  const isOn = title.status === 'ongoing';
  /* ТЗ 1.2: длина графика — из единого правила, а не из поля `episodes` (у «Ван-Пис»
     там стояла заглушка 24, из-за чего график обрывался на 24-й серии из 1134). */
  const guideTotal = episodeCount(title) ?? 0;

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
      name: epName(names, a.ep),
      date: new Date(a.at).toLocaleDateString('ru-RU', { timeZone: MSK, day: 'numeric', month: 'long', year: 'numeric' }),
      time: `${formatClock(a.at)} МСК`,
      status: a.at <= now ? 'вышла' : 'ожидается',
    }));
    const maxAired = Math.max(...airingRows.map((a) => a.ep));
    // Следующую серию добавляем только когда итог действительно объявлен источником.
    if (episodeInfoTotal(title) !== null && maxAired < guideTotal) {
      rows.push({
        ep: String(maxAired + 1),
        name: epName(names, maxAired + 1),
        date: 'по графику онгоингов',
        time: '',
        status: 'ожидается',
      });
    }
  } else if (isOn) {
    rows = [];
  } else {
    const ed = (title.epdates ?? {}) as Record<string, number>;
    rows = Array.from({ length: Math.min(guideTotal, 60) }, (_, i) => i + 1).map((ep) => {
      const at = ed[String(ep)] ?? ed[ep as unknown as string];
      return {
        ep: String(ep),
        name: epName(names, ep),
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
      {guideTotal > 60 && !isOn && !isUp ? <p className="panel__note">Показаны первые 60 серий из {guideTotal}.</p> : null}
    </section>
  );
}
