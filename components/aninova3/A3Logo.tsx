import Link from 'next/link';

/** Логотип гибрида: нейтральный wordmark A + Nova Pulse как единственный «живой» элемент. */
export function A3Logo({ large = false }: { large?: boolean }) {
  return (
    <Link className={`a3-logo${large ? ' a3-logo--lg' : ''}`} href="/preview/aninova-3" aria-label="AniNova 3.0 — на главную">
      <span className="a3-pulse" aria-hidden />
      <span className="a3-logo__word">AniNova</span>
      <span className="a3-logo__ver" aria-hidden>
        3.0
      </span>
    </Link>
  );
}
