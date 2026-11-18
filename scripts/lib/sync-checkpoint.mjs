/**
 * Keep episode-sync checkpoints resumable only while a run is incomplete.
 * A successful scheduled run must start fresh next time, otherwise ongoing titles
 * remain marked done forever and their newly aired episodes are never fetched.
 */
export function prepareSyncCheckpoint(saved, mode) {
  if (!saved || saved.mode !== mode || saved.completed === true) {
    return { done: [], at: null, mode, completed: false };
  }

  return {
    ...saved,
    done: Array.isArray(saved.done) ? saved.done : [],
    mode,
    completed: false,
  };
}

export function syncRunIsComplete(planLength, queueLength) {
  return planLength === queueLength;
}
