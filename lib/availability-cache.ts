/**
 * Availability responses are cacheable only when the Supabase availability query
 * completed successfully. A transient database failure must never be cached as
 * a complete "guess"/"none" result for the full CDN TTL.
 */
export function availabilityCacheControl(databaseAvailable: boolean): string {
  return databaseAvailable
    ? 'public, s-maxage=600, stale-while-revalidate=60'
    : 'private, no-store, max-age=0';
}
