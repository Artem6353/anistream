export declare function dedupeByKeys<T extends Record<string, unknown>>(
  rows: T[],
  keys: string[],
): { rows: T[]; dropped: number };
