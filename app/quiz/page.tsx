'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Title } from '@/lib/types';
import { PosterCard } from '@/components/anime/PosterCard';

const STEPS = [
  { key: 'time', q: 'Сколько времени есть?', opts: [['one', '1 серия'], ['short', '12 серий'], ['long', '24+ серий'], ['movie', 'Фильм']] },
  { key: 'mood', q: 'Настроение?', opts: [['laugh', 'Посмеяться'], ['cry', 'Поплакать'], ['think', 'Подумать'], ['action', 'Экшен'], ['relax', 'Расслабиться']] },
  { key: 'genres', q: 'Жанры (можно несколько)', opts: [['action', 'Экшен'], ['romance', 'Романтика'], ['comedy', 'Комедия'], ['drama', 'Драма'], ['fantasy', 'Фэнтези'], ['sci-fi', 'Sci-fi'], ['slice-of-life', 'Повседневность'], ['mystery', 'Мистика']], multi: true },
  { key: 'length', q: 'Длина?', opts: [['lt12', 'До 12 серий'], ['mid', '12–50'], ['gt50', '50+']] },
  { key: 'year', q: 'Год?', opts: [['new', '2023+'], ['old', 'До 2010'], ['any', 'Всё равно']] },
] as const;

/** Квиз подбора (ТЗ 18.3): 5 вопросов → 5 тайтлов из каталога. */
export default function QuizPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [items, setItems] = useState<Title[] | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (key: string, value: string, multi?: boolean) => {
    setAnswers((p) => {
      if (!multi) return { ...p, [key]: value };
      const list = (p[key] as string[] | undefined) ?? [];
      return { ...p, [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] };
    });
    if (!multi) advance({ ...answers, [key]: value });
  };

  const advance = async (next: Record<string, unknown>) => {
    if (step + 1 < STEPS.length) {
      setAnswers(next);
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/quiz', { method: 'POST', body: JSON.stringify(next), headers: { 'Content-Type': 'application/json' } });
      const j = await r.json();
      setItems(j.items ?? []);
    } catch {
      setItems([]);
    }
    setBusy(false);
  };

  if (items) {
    return (
      <div className="container quiz">
        <h1>Ваша подборка готова 🎯</h1>
        <div className="rail rail--grid">
          {items.map((t) => (
            <PosterCard key={t.slug} title={t} />
          ))}
        </div>
        <div className="quiz__actions">
          <button
            type="button"
            className="btn btn--outline btn--md"
            onClick={() => {
              setItems(null);
              setStep(0);
              setAnswers({});
            }}
          >
            Перепройти
          </button>
          <Link className="btn btn--primary btn--md" href={items[0] ? `/anime/${items[0].slug}` : '/catalog'}>
            Смотреть
          </Link>
        </div>
      </div>
    );
  }

  const s = STEPS[step];
  return (
    <div className="container quiz">
      <h1>Квиз: что посмотреть?</h1>
      <p className="quiz__progress">
        Вопрос {step + 1} из {STEPS.length}
      </p>
      <h2>{s.q}</h2>
      <div className="quiz__opts">
        {s.opts.map(([v, label]) => (
          <button
            key={v}
            type="button"
            className={`btn btn--outline btn--md ${(answers[s.key] as string[] | string | undefined)?.toString().includes(v) ? 'is-active' : ''}`}
            onClick={() => pick(s.key, v, 'multi' in s && Boolean(s.multi))}
          >
            {label}
          </button>
        ))}
      </div>
      {'multi' in s && s.multi ? (
        <button type="button" className="btn btn--primary btn--md" disabled={busy} onClick={() => advance(answers)}>
          {busy ? '…' : 'Дальше'}
        </button>
      ) : null}
    </div>
  );
}
