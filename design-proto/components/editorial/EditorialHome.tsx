import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/proto/Icon';
import { Pulse } from '@/components/proto/Pulse';
import { anime, comics, getAnime } from '@/lib/mock';

export function EditorialHome() {
  const lead = getAnime('frieren');
  const stories = [
    {
      href: '/editorial/anime/magicheskaya-bitva',
      img: getAnime('magicheskaya-bitva').backdrop,
      title: '«Магическая битва»: третий сезон и цена силы',
      text: 'Сериал перестал быть турниром и стал разговором о том, кто платит за победу. Разбираем три эпизода, которые меняют правила.',
      meta: 'Разбор · 9 минут',
    },
    {
      href: '/editorial/comics',
      img: getAnime('tyohu').backdrop,
      title: 'Комиксы на русском: пять оригиналов этой осени',
      text: '«Стеклянный город», «Ноль-меридиан» и ещё три истории, которые не нужно ждать в переводе.',
      meta: 'Подборка · 6 минут',
    },
    {
      href: '/editorial/catalog',
      img: getAnime('ataka-titanov').backdrop,
      title: 'Что выходит на этой неделе',
      text: 'Полный список премьер и продолжений: от долгожданных финалов до тихих повседневных историй.',
      meta: 'Расписание · обновлено сегодня',
    },
  ];
  const watchlist = anime.filter((a) => a.rating > 0).slice(0, 5);

  return (
    <div className="e-wrap e-home">
      <section className="e-lead" aria-labelledby="e-lead-h">
        <div className="e-lead-kicker">
          <Pulse live size={5} />
          <span className="e-label">Главное · выпуск №04</span>
        </div>
        <div className="e-lead-grid">
          <div>
            <h1 id="e-lead-h">«Фрирен»: как сериал о вечности стал самым человечным в сезоне</h1>
            <p className="e-standfirst">
              История эльфийки, которая пережила своих друзей и только потом заметила, что они были её жизнью. Медленное
              фэнтези, которому удалось то, что не удаётся громким финалам.
            </p>
            <p className="e-byline">
              <b>Обзор</b>
              <span>12 минут чтения</span>
              <span>Madhouse</span>
              <span>2023 · 28 эпизодов</span>
            </p>
            <div className="e-lead-actions">
              <Link className="e-btn e-btn--solid" href={`/editorial/anime/${lead.slug}`}>
                Читать разбор <Icon name="arrow" size={14} />
              </Link>
              <Link className="e-btn" href="/editorial/catalog">
                Индекс каталога
              </Link>
            </div>
            <div className="e-issue-links">
              <Link href="/editorial/catalog">
                В этом выпуске: каталог <span>12 тайтлов</span>
              </Link>
              <Link href="/editorial/comics">
                Комиксы на русском <span>6 историй</span>
              </Link>
              <Link href={`/editorial/anime/${lead.slug}/watch`}>
                Кинозал: «Фрирен», серия 1 <span>24 минуты</span>
              </Link>
            </div>
          </div>
          <figure className="e-lead-figure">
            <Image
              src={lead.poster}
              alt={`Обложка: ${lead.title}`}
              width={420}
              height={560}
              sizes="(max-width: 768px) 100vw, 380px"
              priority
            />
            <figcaption>
              <span>Демонстрационная обложка</span>
              <span>не постер тайтла</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="e-secondary" aria-label="Ещё в выпуске">
        {stories.map((s, i) => (
          <Link key={s.href} href={s.href} className="e-story">
            <Image src={s.img} alt="" width={168} height={105} sizes="(max-width: 768px) 84px, 200px" />
            <div>
              <span className="e-story-num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <span className="e-story-meta">{s.meta}</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="e-block" aria-labelledby="e-watchlist-h">
        <div className="e-block-head">
          <h2 id="e-watchlist-h">Сейчас смотрят</h2>
          <Link className="e-textlink" href="/editorial/catalog">
            Весь индекс
          </Link>
        </div>
        <div className="e-watchlist">
          {watchlist.map((a, i) => (
            <Link key={a.slug} href={`/editorial/anime/${a.slug}`} className="e-watch-row">
              <span className="e-watch-rank">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{a.title}</h3>
                <p>
                  {a.original} · {a.year} · {a.studio}
                </p>
              </div>
              <span className="e-score">{a.rating.toFixed(1)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="e-block" aria-labelledby="e-comics-h">
        <div className="e-block-head">
          <h2 id="e-comics-h">Комиксы · только на русском</h2>
          <Link className="e-textlink" href="/editorial/comics">
            Все истории
          </Link>
        </div>
        <div className="e-cover-row">
          {comics.slice(0, 3).map((c) => (
            <Link key={c.slug} href={`/editorial/comics/${c.slug}`} className="e-cover-card">
              <Image src={c.cover} alt={`Обложка: ${c.title}`} width={240} height={360} sizes="(max-width: 600px) 45vw, 240px" />
              <h3>{c.title}</h3>
              <p>
                {c.author} · {c.chapters} глав
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="e-newsletter" aria-labelledby="e-news-h">
        <h2 id="e-news-h">Письмо по пятницам</h2>
        <p>
          Один выпуск в неделю: что посмотреть, что почитать и что выходит. Без уведомлений и без «горящих» баннеров.
        </p>
        <div className="e-subscribe">
          <label className="sr-only" htmlFor="e-news-email">
            Почта для подписки
          </label>
          <input id="e-news-email" type="email" placeholder="name@mail.ru" autoComplete="email" />
          <button type="button" className="e-btn">
            Подписаться
          </button>
        </div>
        <p className="e-label">Демо: подписка не отправляется, адрес никуда не уходит.</p>
      </section>
    </div>
  );
}
