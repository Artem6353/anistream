import Image from 'next/image';
import Link from 'next/link';
import { Tabs } from '@/components/proto/Tabs';
import { anime, profile } from '@/lib/mock';

export function CinematicProfile() {
  const history = profile.history
    .map((h) => ({ ...h, item: anime.find((a) => a.slug === h.slug) }))
    .filter((h) => h.item);
  const shelf = profile.bookmarks.map((slug) => anime.find((a) => a.slug === slug)).filter(Boolean);

  return (
    <div className="c-main">
      <div className="c-profile-banner">
        <Image src="/design/backdrops/04.jpg" alt="" width={1600} height={500} sizes="100vw" priority />
      </div>
      <div className="c-wrap">
        <div className="c-profile-head">
          <Image className="c-profile-avatar" src={profile.avatar} alt="" width={84} height={84} />
          <div>
            <h1 className="c-profile-name">{profile.name}</h1>
            <p className="c-profile-handle">
              {profile.handle} · с {profile.since} · демо-профиль
            </p>
          </div>
          <Link className="c-btn c-btn--sm c-profile-edit" href="/cinematic/login">
            Настройки
          </Link>
        </div>

        <dl className="c-stats">
          {profile.stats.map((s) => (
            <div className="c-stat" key={s.label}>
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </dl>

        <Tabs
          label="Разделы профиля"
          listClassName="c-tabs"
          tabClassName="c-tab"
          panelClassName="c-panel"
          items={[
            {
              id: 'history',
              label: 'История',
              content: (
                <div>
                  {history.map((h) => (
                    <Link key={`${h.slug}-${h.episode}`} className="c-hist-row" href={`/cinematic/anime/${h.slug}/watch`}>
                      <Image src={h.item!.poster} alt="" width={44} height={66} sizes="44px" />
                      <span style={{ minWidth: 0 }}>
                        <b>{h.item!.title}</b>
                        <p>
                          Серия {h.episode} · {h.percent}% · {h.item!.studio}
                        </p>
                      </span>
                      <time>{h.when}</time>
                    </Link>
                  ))}
                  <p className="c-label" style={{ marginTop: 14, lineHeight: 1.7 }}>
                    История демонстрационная · в production — профиль + Supabase
                  </p>
                </div>
              ),
            },
            {
              id: 'shelf',
              label: 'Полка',
              content: (
                <div className="c-grid">
                  {shelf.map((a) => (
                    <Link key={a!.slug} href={`/cinematic/anime/${a!.slug}`} className="c-poster-card">
                      <span className="c-poster-art">
                        <Image src={a!.poster} alt={`Обложка: ${a!.title}`} width={240} height={360} sizes="15vw" />
                      </span>
                      <b>{a!.title}</b>
                      <span>
                        {a!.year} · {a!.genres[0]}
                      </span>
                    </Link>
                  ))}
                </div>
              ),
            },
            {
              id: 'lists',
              label: 'Списки',
              content: (
                <div>
                  {profile.lists.map((l) => (
                    <div key={l.name} className="c-hist-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                      <span>
                        <b>
                          {l.name} · {l.count}
                        </b>
                        <p>{l.note}</p>
                      </span>
                      <time>демо</time>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              id: 'ach',
              label: 'Достижения',
              content: (
                <div className="c-ach-grid">
                  {profile.achievements.map((a) => (
                    <div className="c-ach" key={a.title}>
                      <b>{a.title}</b>
                      <span>{a.note}</span>
                    </div>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
