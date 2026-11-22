import { describe, expect, it } from 'vitest';
import {
  invertRelation,
  RELATION_PRIORITY,
  RELATION_LABELS,
  COMIC_KIND_LABELS,
  type WorkRelationKind,
} from '@/lib/aninova3/comics/model';
import {
  buildSourceGraph,
  comicInternalId,
  comicKindFrom,
  comicStatusFrom,
  normalizeRawRelation,
  relationFromRaw,
} from '@/lib/aninova3/comics/source-graph';
import { slugifyTitle } from '@/lib/aninova3/comics/store';

/** B1-C.1: модель связей и устойчивые идентификаторы. */

describe('relationType AniList → роль произведения', () => {
  it('ADAPTATION — это первоисточник, а не «связанное»', () => {
    expect(relationFromRaw('ADAPTATION')).toBe('SOURCE');
    expect(relationFromRaw('adaptation')).toBe('SOURCE');
  });

  it('продолжения и предыстории не становятся первоисточником', () => {
    expect(relationFromRaw('SEQUEL')).toBe('SEQUEL');
    expect(relationFromRaw('PREQUEL')).toBe('PREQUEL');
    expect(relationFromRaw('SEQUEL')).not.toBe('SOURCE');
  });

  it('SIDE_STORY и SPIN_OFF сводятся к ответвлению', () => {
    expect(relationFromRaw('SIDE_STORY')).toBe('SPIN_OFF');
    expect(relationFromRaw('SPIN_OFF')).toBe('SPIN_OFF');
  });

  it('неизвестный relationType не отбрасывается и не притворяется первоисточником', () => {
    expect(normalizeRawRelation('WEIRD_NEW_TYPE')).toBe('UNKNOWN');
    expect(relationFromRaw('WEIRD_NEW_TYPE')).toBe('RELATED');
    expect(relationFromRaw('')).toBe('RELATED');
    expect(relationFromRaw(null)).toBe('RELATED');
  });

  it('PARENT/SUMMARY/COMPILATION остаются RELATED', () => {
    for (const raw of ['PARENT', 'SUMMARY', 'COMPILATION', 'CHARACTER', 'FULL_STORY', 'OTHER']) {
      expect(relationFromRaw(raw)).toBe('RELATED');
    }
  });

  it('обратная роль инвертируется корректно', () => {
    expect(invertRelation('SOURCE')).toBe('ADAPTATION');
    expect(invertRelation('ADAPTATION')).toBe('SOURCE');
    expect(invertRelation('SEQUEL')).toBe('PREQUEL');
    expect(invertRelation('PREQUEL')).toBe('SEQUEL');
    expect(invertRelation('SPIN_OFF')).toBe('SPIN_OFF');
    expect(invertRelation('RELATED')).toBe('RELATED');
  });

  it('приоритет дедупликации ставит SOURCE выше остальных ролей', () => {
    const kinds = Object.keys(RELATION_PRIORITY) as WorkRelationKind[];
    const sorted = [...kinds].sort((a, b) => RELATION_PRIORITY[b] - RELATION_PRIORITY[a]);
    expect(sorted[0]).toBe('SOURCE');
    expect(RELATION_PRIORITY.SOURCE).toBeGreaterThan(RELATION_PRIORITY.SEQUEL);
    expect(RELATION_PRIORITY.SPIN_OFF).toBeGreaterThan(RELATION_PRIORITY.RELATED);
  });

  it('у каждой роли и вида есть человекочитаемая подпись', () => {
    for (const kind of Object.keys(RELATION_PRIORITY) as WorkRelationKind[]) {
      expect(RELATION_LABELS[kind]?.length).toBeGreaterThan(0);
    }
    for (const kind of ['manga', 'manhwa', 'manhua', 'webtoon', 'comic'] as const) {
      expect(COMIC_KIND_LABELS[kind]?.length).toBeGreaterThan(0);
    }
  });
});

describe('вид комикса и статус', () => {
  it('страна происхождения важнее формата AniList', () => {
    expect(comicKindFrom('MANGA', 'KR')).toBe('manhwa');
    expect(comicKindFrom('MANGA', 'CN')).toBe('manhua');
    expect(comicKindFrom('MANGA', 'TW')).toBe('manhua');
    expect(comicKindFrom('MANGA', 'JP')).toBe('manga');
    expect(comicKindFrom('ONE_SHOT', 'JP')).toBe('comic');
  });

  it('вебтун не угадывается по формату', () => {
    expect(comicKindFrom('MANGA', 'KR')).not.toBe('webtoon');
  });

  it('статусы AniList маппятся без выдумок', () => {
    expect(comicStatusFrom('FINISHED')).toBe('completed');
    expect(comicStatusFrom('RELEASING')).toBe('ongoing');
    expect(comicStatusFrom('HIATUS')).toBe('hiatus');
    expect(comicStatusFrom('CANCELLED')).toBe('cancelled');
    expect(comicStatusFrom('NOT_YET_RELEASED')).toBe('unknown');
    expect(comicStatusFrom(null)).toBe('unknown');
  });
});

describe('устойчивые идентификаторы и slug', () => {
  it('внутренний id не зависит от slug и маршрута', () => {
    expect(comicInternalId(30011)).toBe('comic:anilist:30011');
    expect(comicInternalId(30011)).toBe(comicInternalId(30011));
  });

  it('slug транслитерируется и остаётся ASCII', () => {
    expect(slugifyTitle('Наруто')).toBe('naruto');
    expect(slugifyTitle('Город стекла')).toBe('gorod-stekla');
    expect(slugifyTitle('NARUTO -ナルト-')).toBe('naruto');
    expect(slugifyTitle('   ')).toBe('');
  });

  it('индексы графа строятся и по AniList, и по MAL id', () => {
    const graph = buildSourceGraph({
      comics: [{ anilist: 1, mal: 2, titleOriginal: 'A' }],
      edges: [{ anime: 10, comic: 1, raw: 'ADAPTATION' }],
    });
    expect(graph.byAnime.get(10)).toHaveLength(1);
    expect(graph.byComicAniList.get(1)).toHaveLength(1);
    expect(graph.comicsByMal.get(2)?.[0].anilist).toBe(1);
    expect(graph.comicsById.get('comic:anilist:1')?.titleOriginal).toBe('A');
  });

  it('битые рёбра не ломают сборку индексов', () => {
    const graph = buildSourceGraph({
      comics: [{ anilist: Number.NaN, titleOriginal: 'broken' }],
      edges: [{ anime: Number.NaN, comic: 1, raw: 'ADAPTATION' }],
    });
    expect(graph.comics).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });
});
