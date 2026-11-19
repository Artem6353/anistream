export function parseDone(raw: unknown): Map<string, number>;
export function isDoneRecently(
  done: Map<string, number>,
  id: string | number,
  nowMs: number,
  ttlMs: number,
): boolean;
export function markDone(done: Map<string, number>, id: string | number, nowMs: number): Map<string, number>;
export function serializeDone(
  done: Map<string, number>,
  nowMs: number,
  maxAgeMs?: number,
): Record<string, number>;
