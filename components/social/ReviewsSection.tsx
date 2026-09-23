'use client';

import { useEffect, useMemo, useState } from 'react';
import { addReview, loadReviews, voteReview, fetchCaptcha, SOCIAL_MODE, type ReviewItem, type CaptchaChallenge } from '@/lib/social';
import { useLibrary } from '@/lib/library';
import { timeAgo } from '@/lib/format';
import { IconStar } from '@/components/ui/icons';

/** Turnstile (A3.1): включается только в supabase-режиме и только при заданном site key.
 *  Сервер требует токен, если задан TURNSTILE_SECRET (app/api/social/reviews/route.ts). */
const TURNSTILE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const USE_TURNSTILE = SOCIAL_MODE === 'supabase' && Boolean(TURNSTILE_KEY);

/** Отзывы (с оценкой) + комментарии с ответами и лайками/дизлайками. */
export function ReviewsSection({ slug }: { slug: string }) {
  const [tab, setTab] = useState<'reviews' | 'comments'>('reviews');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [name, setName] = useState('');
  const [rating, setRating] = useState(8);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [tsToken, setTsToken] = useState('');
  const [formError, setFormError] = useState('');
  const { settings } = useLibrary();

  useEffect(() => {
    if (!USE_TURNSTILE) return;
    const w = window as unknown as { aniTurnstileCb?: (t: string) => void; turnstile?: { reset: (el?: string) => void } };
    w.aniTurnstileCb = (t: string) => setTsToken(t);
    if (document.querySelector('script[data-turnstile]')) return;
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    s.dataset.turnstile = '1';
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (SOCIAL_MODE !== 'supabase' || USE_TURNSTILE) return;
    let cancelled = false;
    fetchCaptcha().then((c) => !cancelled && setCaptcha(c));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    setName(settings.displayName ?? '');
    let cancelled = false;
    loadReviews(slug).then((r) => !cancelled && setItems(r));
    return () => {
      cancelled = true;
    };
  }, [slug, settings.displayName]);

  const reviews = useMemo(() => items.filter((i) => i.rating !== null && !i.parent), [items]);
  const comments = useMemo(() => items.filter((i) => i.parent === null && i.rating === null), [items]);
  const avg = reviews.length ? reviews.reduce((a, r) => a + (r.rating ?? 0), 0) / reviews.length : 0;

  const submit = async () => {
    const clean = text.trim().slice(0, 2000);
    if (!clean) return;
    const res = await addReview(
      {
        slug,
        name: name.trim() || 'Гость',
        rating: tab === 'reviews' ? rating : null,
        text: clean,
        parent: tab === 'comments' ? replyTo : null,
      },
      SOCIAL_MODE === 'supabase' && !USE_TURNSTILE && captcha ? { token: captcha.token, answer: Number(captchaAnswer) } : undefined,
      USE_TURNSTILE ? tsToken : undefined,
    );
    if (res.error) {
      setFormError(res.error);
      if (!USE_TURNSTILE) {
        const c = await fetchCaptcha();
        if (c) setCaptcha(c);
      } else {
        (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
        setTsToken('');
      }
      setCaptchaAnswer('');
      return;
    }
    setFormError('');
    setItems((prev) => [res.item!, ...prev]);
    setText('');
    setReplyTo(null);
    setCaptchaAnswer('');
    if (USE_TURNSTILE) {
      (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
      setTsToken('');
    } else if (SOCIAL_MODE === 'supabase') {
      const c = await fetchCaptcha();
      if (c) setCaptcha(c);
    }
  };

  return (
    <section className="reviews" aria-label="Отзывы и комментарии">
      <div className="reviews__head">
        <h2 className="section-title">Отзывы и обсуждения</h2>
        {avg > 0 ? (
          <span className="reviews__avg" title={`Средняя оценка посетителей: ${avg.toFixed(1)}`}>
            <IconStar size={13} /> {avg.toFixed(1)} · {reviews.length}
          </span>
        ) : null}
        <span className="reviews__mode" title={SOCIAL_MODE === 'supabase' ? 'Общие отзывы (Supabase)' : 'Локальный режим: отзывы видны в этом браузере; для общих включите Supabase (docs/DEPLOY.md)'}>
          {SOCIAL_MODE === 'supabase' ? 'общий режим' : 'локальный режим'}
        </span>
      </div>

      <div className="profile-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'reviews'} className={tab === 'reviews' ? 'is-active' : ''} onClick={() => setTab('reviews')}>
          Отзывы · {reviews.length}
        </button>
        <button role="tab" aria-selected={tab === 'comments'} className={tab === 'comments' ? 'is-active' : ''} onClick={() => setTab('comments')}>
          Комментарии · {comments.length}
        </button>
      </div>

      <div className="reviews__form">
        <input className="input" placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        {tab === 'reviews' ? (
          <label className="reviews__rating">
            Оценка
            <select className="input" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {replyTo ? (
          <button type="button" className="chip is-active" onClick={() => setReplyTo(null)}>
            Ответ на комментарий ✕
          </button>
        ) : null}
        <textarea className="input reviews__text" placeholder={tab === 'reviews' ? 'Ваш отзыв об аниме…' : 'Написать комментарий…'} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3} />
        {USE_TURNSTILE ? (
          <div className="cf-turnstile" data-sitekey={TURNSTILE_KEY} data-callback="aniTurnstileCb" />
        ) : null}
        {SOCIAL_MODE === 'supabase' && !USE_TURNSTILE && captcha ? (
          <label className="reviews__rating">
            {captcha.question}
            <input className="input" style={{ width: 80 }} value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} inputMode="numeric" />
          </label>
        ) : null}
        {formError ? <p className="panel__note" style={{ color: 'var(--danger)' }}>{formError}</p> : null}
        <button className="btn btn--primary btn--md" onClick={submit}>
          Отправить
        </button>
      </div>

      <ul className="reviews__list">
        {(tab === 'reviews' ? reviews : comments).map((r) => (
          <li key={r.id} className="review">
            <div className="review__head">
              <strong>{r.name}</strong>
              {r.rating !== null ? (
                <span className="review__rating">
                  <IconStar size={11} /> {r.rating}
                </span>
              ) : null}
              <span className="review__ts">{timeAgo(r.ts)}</span>
            </div>
            <p className="review__text">{r.text}</p>
            <div className="review__actions">
              <button type="button" className="review__vote" onClick={async () => { await voteReview(slug, r.id, 1); setItems((p) => p.map((x) => (x.id === r.id ? { ...x, likes: x.likes + 1 } : x))); }}>
                👍 {r.likes}
              </button>
              <button type="button" className="review__vote" onClick={async () => { await voteReview(slug, r.id, -1); setItems((p) => p.map((x) => (x.id === r.id ? { ...x, dislikes: x.dislikes + 1 } : x))); }}>
                👎 {r.dislikes}
              </button>
              {tab === 'comments' ? (
                <button type="button" className="review__vote" onClick={() => setReplyTo(r.id)}>
                  Ответить
                </button>
              ) : null}
            </div>
            {tab === 'comments'
              ? items
                  .filter((c) => c.parent === r.id)
                  .map((c) => (
                    <div key={c.id} className="review review--child">
                      <div className="review__head">
                        <strong>{c.name}</strong>
                        <span className="review__ts">{timeAgo(c.ts)}</span>
                      </div>
                      <p className="review__text">{c.text}</p>
                    </div>
                  ))
              : null}
          </li>
        ))}
        {(tab === 'reviews' ? reviews : comments).length === 0 ? <li className="reviews__empty">Пока пусто — будьте первым!</li> : null}
      </ul>
    </section>
  );
}
