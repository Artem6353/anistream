import { describe, expect, it } from 'vitest';
import { prepareSyncCheckpoint, syncRunIsComplete } from '../scripts/lib/sync-checkpoint.mjs';

describe('episode sync checkpoint lifecycle', () => {
  it('resumes an interrupted run of the same mode', () => {
    expect(prepareSyncCheckpoint({ mode: 'full', done: [1, 2], completed: false }, 'full').done)
      .toEqual([1, 2]);
  });

  it('starts a fresh run after a completed run', () => {
    expect(prepareSyncCheckpoint({ mode: 'ongoing', done: [1, 2], completed: true }, 'ongoing').done)
      .toEqual([]);
  });

  it('does not reuse a checkpoint from another mode or legacy format', () => {
    expect(prepareSyncCheckpoint({ mode: 'ongoing', done: [1] }, 'full').done).toEqual([]);
    expect(prepareSyncCheckpoint({ done: [1] }, 'ongoing').done).toEqual([]);
  });

  it('marks a limited batch incomplete until all queued titles are processed', () => {
    expect(syncRunIsComplete(100, 8000)).toBe(false);
    expect(syncRunIsComplete(7900, 7900)).toBe(true);
  });
});
