import { describe, expect, it } from 'vitest';
import type { Title } from '@/lib/types';
import { episodeCount, episodeCountLabel, episodeInfo, isMultiEpisode, maxKnownEpisode } from '@/lib/episodes';
import { clampToSentence, titleMetaDescription } from '@/lib/text';

/** Минимальный тайтл: заполняем только то, что влияет на правило подсчёта. */
function t(patch: Partial<Title>): Title {
  return {
    anilistId: 1,
    slug: 'test',
    ru: 'Тест',
    romaji: 'Test',
    type: 'tv',
    year: 2020,
    status: 'finished',
    episodes: 12,
    score: 0,
    favourites: 0,
    genres: [],
    poster: '',
    description: '',
    ...patch,
  } as Title;
}

const airing = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ ep: from + i, at: 1_700_000_000_000 + i * 86_400_000 }));

/* ТЗ 1.2, критерий приёмки: у One Piece нет «24»; у анонсов нет выдуманных «12 серий». */
describe('episodeInfo: единое правило подсчёта серий', () => {
  it('RELEASING + episodes=null → вышло N, итог неизвестен', () => {
    const onePiece = t({ status: 'ongoing', episodes: null, airing: airing(1123, 1134) });
    const i = episodeInfo(onePiece);
    expect(i.released).toBe(1134);
    expect(i.total).toBeNull();
    expect(i.totalUnknown).toBe(true);
    expect(episodeCountLabel(onePiece)).toBe('1134+ серий');
  });

  it('RELEASING + заглушка импортера 24 → доверяем airing, а не заглушке', () => {
    const onePiece = t({ status: 'ongoing', episodes: 24, airing: airing(1123, 1134) });
    expect(episodeCount(onePiece)).toBe(1134);
    expect(episodeInfo(onePiece).totalUnknown).toBe(true);
    expect(episodeCountLabel(onePiece)).toBe('1134+ серий');
  });

  it('RELEASING с объявленным итогом больше вышедшего → «вышло X из Y»', () => {
    const show = t({ status: 'ongoing', episodes: 25, airing: airing(1, 12) });
    const i = episodeInfo(show);
    expect(i.released).toBe(12);
    expect(i.total).toBe(25);
    expect(i.totalUnknown).toBe(false);
    expect(episodeCountLabel(show)).toBe('12 серий');
  });

  it('фильм → 1 серия', () => {
    const movie = t({ type: 'movie', episodes: null, status: 'finished' });
    expect(episodeCount(movie)).toBe(1);
    expect(episodeInfo(movie).isSingle).toBe(true);
    expect(isMultiEpisode(movie)).toBe(false);
    expect(episodeCountLabel(movie)).toBe('1 серия');
  });

  it('анонс без подтверждённого числа → числа нет (не «12 серий» из воздуха)', () => {
    const stubAnnounce = t({ status: 'upcoming', episodes: 12, airing: [] });
    expect(episodeCount(stubAnnounce)).toBeNull();
    expect(episodeCountLabel(stubAnnounce)).toBeNull();
    expect(isMultiEpisode(stubAnnounce)).toBe(false);

    const nullAnnounce = t({ status: 'upcoming', episodes: null });
    expect(episodeCount(nullAnnounce)).toBeNull();
  });

  it('анонс с реальным числом от источника → показываем его', () => {
    const announced = t({ status: 'upcoming', episodes: 26 });
    expect(episodeCount(announced)).toBe(26);
    expect(episodeCountLabel(announced)).toBe('26 серий');
  });

  it('FINISHED → число из источника; при заглушке — из точных дат', () => {
    expect(episodeCount(t({ status: 'finished', episodes: 74 }))).toBe(74);
    const withDates = t({ status: 'finished', episodes: null, epdates: { 1: 1, 2: 2, 3: 3 } });
    expect(episodeCount(withDates)).toBe(3);
  });

  it('сериал из 24 серий без графика не теряет своё число', () => {
    expect(episodeCount(t({ status: 'finished', episodes: 24 }))).toBe(24);
    expect(episodeCount(t({ status: 'ongoing', episodes: 24, airing: [] }))).toBe(24);
  });

  it('maxKnownEpisode берёт максимум из airing и epdates', () => {
    expect(maxKnownEpisode(t({ airing: airing(5, 9), epdates: { 12: 1 } }))).toBe(12);
    expect(maxKnownEpisode(t({}))).toBe(0);
  });

  it('episodes=null не роняет подсчёт и не даёт NaN', () => {
    const weird = t({ episodes: null, status: 'ongoing', airing: [] });
    expect(episodeCount(weird)).toBeNull();
    expect(episodeCountLabel(weird)).toBeNull();
  });
});

/* ТЗ 1.4, критерий приёмки: ни одно описание не обрывается на полуслове. */
describe('clampToSentence: обрезка по границе предложения', () => {
  const text =
    'Король пиратов Роджер был единственным, кому покорился Гранд Лайн. Его последние слова раскрыли местонахождение сокровища. ' +
    'Так началась Великая эра пиратства, и тысячи авантюристов устремились за мифическим Ван-Пис.';

  it('короткий текст возвращается как есть', () => {
    expect(clampToSentence('Короткое описание.', 160)).toBe('Короткое описание.');
    expect(clampToSentence('', 160)).toBe('');
  });

  it('режет по концу предложения, без обрыва слова и без «…»', () => {
    const out = clampToSentence(text, 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out).toBe('Король пиратов Роджер был единственным, кому покорился Гранд Лайн.');
    expect(out.endsWith('…')).toBe(false);
  });

  it('одно длинное предложение режется по слову с «…»', () => {
    const long = 'Слишком '.repeat(60).trim();
    const out = clampToSentence(long, 80);
    expect(out.length).toBeLessThanOrEqual(81);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });

  it('не принимает точку в числе за конец предложения', () => {
    const out = clampToSentence('Рейтинг 8.7 из десяти удерживает сериал в топе десятилетия. Дальше идёт текст.', 70);
    expect(out).toContain('8.7');
  });

  it('нормализует пробелы и не оставляет висячую пунктуацию', () => {
    expect(clampToSentence('Первое   предложение.  Второе предложение.', 25)).toBe('Первое предложение.');
  });
});

describe('titleMetaDescription: 150–160 символов', () => {
  it('попадает в вилку и заканчивается целым предложением', () => {
    const d = titleMetaDescription({
      name: 'Ван-Пис',
      year: 1999,
      genres: ['экшен', 'приключения', 'комедия'],
      description:
        'Король пиратов Роджер был единственным, кому покорился весь Гранд Лайн. Его казнь породила Великую эру пиратства. Монки Д. Луффи собирает команду и выходит в море.',
    });
    expect(d.length).toBeGreaterThanOrEqual(150);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d).toMatch(/[.!?…"»]$/);
    expect(d).toContain('Ван-Пис (1999)');
  });

  it('без описания добирает хвост и не рвёт слово', () => {
    const d = titleMetaDescription({ name: 'Анонс', year: 2027, genres: [], description: '' });
    expect(d.length).toBeGreaterThanOrEqual(60);
    expect(d).not.toMatch(/\s…$/);
  });

  it('очень длинное описание не يخرج за max', () => {
    const d = titleMetaDescription({
      name: 'Очень длинное название тайтла, которое само по себе занимает много места',
      year: 2024,
      genres: ['драма', 'фантастика', 'триллер', 'приключения', 'мистика'],
      description: 'Короткое. '.repeat(40),
      max: 160,
    });
    expect(d.length).toBeLessThanOrEqual(160);
  });
});
