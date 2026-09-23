import type { Title } from './types';

const REL_TYPES = new Set(['SEQUEL', 'PREQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF', 'FULL_STORY', 'SUMMARY']);

export const REL_LABELS: Record<string, string> = {
  SEQUEL: 'Продолжение',
  PREQUEL: 'Приквел',
  PARENT: 'Основная серия',
  SIDE_STORY: 'Сайд-стори',
  SPIN_OFF: 'Спин-офф',
  FULL_STORY: 'Полная версия',
  SUMMARY: 'Дайджест',
};

const SEASON_ORDER: Record<string, number> = { winter: 1, spring: 2, summer: 3, fall: 4 };

/** Франшиза тайтла: BFS по связям (undirected) + хронологический порядок просмотра. */
export function watchOrder(title: Title, byId: Map<number, Title>): Title[] {
  const start = byId.get(title.anilistId) ?? title;
  const seen = new Set<number>([start.anilistId]);
  const queue: Title[] = [start];
  const group: Title[] = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const rel of cur.relations ?? []) {
      if (!REL_TYPES.has(rel.type) || seen.has(rel.id)) continue;
      const node = byId.get(rel.id);
      if (!node) continue;
      seen.add(rel.id);
      group.push(node);
      queue.push(node);
    }
  }
  return group.sort(
    (a, b) => a.year - b.year || (SEASON_ORDER[a.season ?? ''] ?? 0) - (SEASON_ORDER[b.season ?? ''] ?? 0) || a.anilistId - b.anilistId,
  );
}
