import Image from 'next/image';
import Link from 'next/link';
import { Tabs } from '@/components/proto/Tabs';
import { anime, profile } from '@/lib/mock';

export function EditorialProfile() {
  const history = profile.history
    .map((h) => ({ ...h, item: anime.find((a) => a.slug === h.slug) }))
    .filter((h) => h.item);
  const shelf = profile.bookmarks.map((slug) => anime.find((a) => a.slug === slug)).filter(Boolean);

  return (
    <div className="e-wrap">
      <div className="e-profile">
        <header className="e-dossier-head">
          <div className="e-dossier-top">
            <Image className="e-avatar" src={profile.avatar} alt="" width={64} height={64} />
            <div>
              <span className="e-label">Личное дело № 214</span>
              <h1>{profile.name}</h1>
              <span className="e-label">
                {profile.handle} · читатель с {profile.since}
              </span>
            </div>
            <Link className="e-btn" href="/editorial/login" style={{ marginLeft: 'auto' }}>
              Настройки
            </Link>
          </div>
          <dl className="e-stat-line">
            {profile.stats.map((s) => (
              <div className="e-stat" key={s.label}>
                <span>{s.label}</span>
                <b>{s.value}</b>
              </div>
            ))}
          </dl>
        </header>

        <Tabs
          label="Разделы личного дела"
          listClassName="e-tabs"
          tabClassName="e-tab"
          panelClassName="e-panel"
          items={[
            {
              id: 'history',
              label: 'История',
              content: (
                <div>
                  {history.map((h) => (
                    <Link key={`${h.slug}-${h.episode}`} className="e-hist" href={`/editorial/anime/${h.slug}/watch`}>
                      <div>
                        <h3>{h.item!.title}</h3>
                        <p>
                          Серия {h.episode} · {h.percent}% · {h.item!.studio}
                        </p>
                      </div>
                      <span className="e-hist-when">{h.when}</span>
                    </Link>
                  ))}
                  <p className="e-label" style={{ marginTop: 14, lineHeight: 1.6 }}>
                    История демонстрационная · в production это профиль + Supabase
                  </p>
                </div>
              ),
            },
            {
              id: 'shelf',
              label: 'Полка',
              content: (
                <div>
                  {shelf.map((a) => (
                    <Link key={a!.slug} className="e-hist" href={`/editorial/anime/${a!.slug}`}>
                      <div>
                        <h3>{a!.title}</h3>
                        <p>
                          {a!.original} · {a!.year} · {a!.genres[0]}
                        </p>
                      </div>
                      <span className="e-hist-when">в закладках</span>
                    </Link>
                  ))}
                </div>
              ),
            },
            {
              id: 'lists',
              label: 'Списки',
              content: (
                <div style={{ paddingTop: 6 }}>
                  {profile.lists.map((l) => (
                    <div className="e-hist" key={l.name}>
                      <div>
                        <h3>
                          {l.name} · {l.count}
                        </h3>
                        <p>{l.note}</p>
                      </div>
                      <span className="e-hist-when">демо</span>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              id: 'stamps',
              label: 'Отметки',
              content: (
                <div className="e-stamps">
                  {profile.achievements.map((a) => (
                    <div className="e-stamp" key={a.title}>
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
