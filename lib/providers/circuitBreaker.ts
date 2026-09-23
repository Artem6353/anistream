/* Circuit breaker провайдеров (B2): 5 ошибок подряд → исключить на 5 мин → пробный запрос.
   Состояние в .cache/circuit.json, переживает рестарты. */
import { promises as fs } from 'node:fs';

const FILE = '.cache/circuit.json';
const THRESHOLD = 5;
const COOLDOWN = 5 * 60_000;

type State = { fails: number; openedAt: number };
let cache: Record<string, State> | null = null;

function load(): Record<string, State> {
  if (cache) return cache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cache = JSON.parse(require('node:fs').readFileSync(FILE, 'utf8'));
  } catch {
    cache = {};
  }
  return cache!;
}

function persist() {
  void fs.mkdir('.cache', { recursive: true }).then(() => fs.writeFile(FILE, JSON.stringify(cache ?? {}))).catch(() => {});
}

/** Открыт ли контур (провайдер в остывании). */
export function isOpen(provider: string): boolean {
  const st = load()[provider];
  if (!st || !st.openedAt) return false;
  if (Date.now() - st.openedAt > COOLDOWN) {
    // half-open: разрешаем один пробный запрос
    st.openedAt = 0;
    persist();
    return false;
  }
  return true;
}

export function recordOk(provider: string) {
  const c = load();
  if (c[provider]) delete c[provider];
  persist();
}

export function recordFail(provider: string) {
  const c = load();
  const st = c[provider] ?? (c[provider] = { fails: 0, openedAt: 0 });
  st.fails += 1;
  if (st.fails >= THRESHOLD) {
    st.openedAt = Date.now();
    st.fails = 0;
  }
  persist();
}

export function circuitState() {
  return load();
}
