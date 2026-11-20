import Image from 'next/image';
import Link from 'next/link';
import { Tabs } from '@/components/proto/Tabs';
import { Icon } from '@/components/proto/Icon';
import { anime, comics, profile } from '@/lib/mock';

export function MinimalProfile() {
  const history = profile.history
    .map((h) => ({ ...h, item: anime.find((a) => a.slug === h.slug) }))
    .filter((h) => h.item);
  const bookmarks = profile.bookmarks.map((slug) => anime.find((a) => a.slug === slug)).filter(Boolean);

  return (
    <div className="m-wrap">
      <div className="m-profile">
        <div className="m-profile-head">
          <Image className="m-avatar" src={profile.avatar} alt="" width={72} height={72} />
          <div>
            <h1 className="m-profile-name">{profile.name}</h1>
            <p className="m-profile-handle">
              {profile.handle} · с {profile.since}
            </p>
          </div>
          <Link className="m-btn m-btn--sm m-profile-edit" href="/minimal/login">
            Настройки
          </Link>
        </div>

        <dl className="m-stats">
          {profile.stats.map((s) => (
            <div className="m-stat" key={s.label}>
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </dl>

        <Tabs
          label="Разделы профиля"
          className="m-profile-tabs"
          listClassName="m-tabs"
          tabClassName="m-tab"
          panelClassName="m-tab-panel"
          items={[
            {
              id: 'history',
              label: 'История',
              content: (
                <div>
                  {history.map((h) => (
                    <Link key={`${h.slug}-${h.episode}`} className="m-hist-row" href={`/minimal/anime/${h.slug}/watch`}>
                      <Image src={h.item!.poster} alt="" width={40} height={60} sizes="40px" />
                      <span style={{ minWidth: 0 }}>
                        <span className="m-row-title" style={{ fontSize: 13.5 }}>
                          {h.item!.title}
                        </span>
                        <span className="m-row-meta">
                          <span>Серия {h.episode}</span>
                          <span>{h.percent}%</span>
                          <span style={{ width: 90 }}>
                            <span className="m-progress" style={{ display: 'block' }}>
                              <span style={{ width: `${h.percent}%` }} />
                            </span>
                          </span>
                        </span>
                      </span>
                      <span className="m-hist-when">{h.when}</span>
                    </Link>
                  ))}
                  <p className="m-demo-note">История демонстрационная: в production — профиль + Supabase, здесь mock.</p>
                </div>
              ),
            },
            {
              id: 'bookmarks',
              label: 'Закладки',
              content: (
                <div>
                  {bookmarks.map((a) => (
                    <Link key={a!.slug} className="m-hist-row" href={`/minimal/anime/${a!.slug}`}>
                      <Image src={a!.poster} alt="" width={40} height={60} sizes="40px" />
                      <span style={{ minWidth: 0 }}>
                        <span className="m-row-title" style={{ fontSize: 13.5 }}>
                          {a!.title}
                        </span>
                        <span className="m-row-meta">
                          <span>{a!.year}</span>
                          <span>{a!.genres[0]}</span>
                        </span>
                      </span>
                      <Icon name="bookmark" size={14} filled />
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
                    <div className="m-list-row" key={l.name}>
                      <b>
                        {l.name} · {l.count}
                      </b>
                      <span>{l.note}</span>
                    </div>
                  ))}
                  <div className="m-list-row">
                    <b>Комиксы на вечер · {comics.length}</b>
                    <span>Обложки из раздела Comics, только RU.</span>
                  </div>
                </div>
              ),
            },
            {
              id: 'achievements',
              label: 'Достижения',
              content: (
                <div className="m-ach">
                  {profile.achievements.map((a) => (
                    <div className="m-ach-item" key={a.title}>
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
