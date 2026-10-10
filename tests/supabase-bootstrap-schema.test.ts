import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Supabase bootstrap schema', () => {
  it('defines the review owner column before creating its update policy', () => {
    const sql = readFileSync(
      path.join(process.cwd(), 'supabase/migrations/001_schema.sql'),
      'utf8',
    );
    const reviewTable = /create table if not exists public\.reviews\s*\(([\s\S]*?)\);/i.exec(sql);

    expect(reviewTable, 'the baseline must create public.reviews').not.toBeNull();
    const tableBody = reviewTable?.[1] ?? '';
    expect(tableBody, 'reviews must include the nullable owner column').toMatch(
      /(?:^|\n)\s*user_id\s+text\b/i,
    );

    const tableEnd = (reviewTable?.index ?? -1) + (reviewTable?.[0].length ?? 0);
    const ownerPolicyIndex = sql.toLowerCase().indexOf('create policy reviews_update');
    expect(ownerPolicyIndex, 'the owner policy must exist after table creation').toBeGreaterThan(tableEnd);
  });
});
