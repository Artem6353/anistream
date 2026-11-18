/**
 * Keep the newest N episode URLs per translation. A limit of 0 explicitly means
 * unlimited; never pass 0 to Array.slice as that would silently import nothing.
 */
export function selectEpisodeNumbers(numbers, limit) {
  const sorted = [...numbers].sort((a, b) => b - a);
  return Number.isFinite(limit) && limit > 0 ? sorted.slice(0, Math.floor(limit)) : sorted;
}
