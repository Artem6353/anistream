'use client';

import { useRef, useState } from 'react';
import { library, useLibrary } from '@/lib/library';
import { isSessionValid, supaRest, supaWhoami, supaUserEmail, storageUpload } from '@/lib/sync';
import { cropImage } from '@/lib/crop';
import { BANNER_GRADIENTS, type PublicProfile } from './ProfileHeader';
import { ACHIEVEMENTS, readUnlocked } from '@/lib/achievements';
import { useToast } from '@/components/ui/Toaster';

/** Карточка профиля в настройках (ТЗ блок 16): username, био ≤200, аватар 320×320 и
    баннер 1500×300 с клиентской обрезкой Canvas, 6 градиентов, до 3 бейджей. */
export function ProfileCard() {
  const { settings } = useLibrary();
  const toast = useToast();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [pinned, setPinned] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const loaded = useRef(false);
  const unlocked = readUnlocked();

  const ensure = async (): Promise<string | null> => {
    if (!isSessionValid()) {
      toast('Сначала войдите в аккаунт');
      return null;
    }
    const uid = await supaWhoami().catch(() => null);
    if (!uid) {
      toast('Сессия истекла — войдите заново');
      return null;
    }
    if (!loaded.current) {
      loaded.current = true;
      try {
        const r = await supaRest('GET', `profiles?user_id=eq.${uid}&select=*`);
        const row = ((await r.json()) as PublicProfile[])[0] ?? null;
        setProfile(row);
        let name = row?.username ?? '';
        if (!name) {
          // профиль создан без username → ник в отзывах не был ссылкой; предлагаем основу из email
          const email = await supaUserEmail();
          if (email) name = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 24);
        }
        setUsername(name ?? '');
        setBio(row?.bio ?? '');
        setPinned(row?.pinned_achievements ?? []);
      } catch {}
    }
    return uid;
  };

  const save = async (patch: Record<string, unknown>) => {
    const uid = await ensure();
    if (!uid) return;
    setBusy('save');
    try {
      await supaRest('POST', 'profiles', { user_id: uid, username: username || null, bio, pinned_achievements: pinned, ...patch });
      setProfile((p) => ({ ...(p ?? ({ user_id: uid } as PublicProfile)), username: username || null, bio, pinned_achievements: pinned, ...patch }));
      toast('Профиль сохранён');
    } catch (e) {
      toast(`Ошибка сохранения: ${(e as Error).message}`);
    }
    setBusy('');
  };

  const upload = async (kind: 'avatar' | 'banner', file: File) => {
    const uid = await ensure();
    if (!uid) return;
    setBusy(kind);
    try {
      const [w, h] = kind === 'avatar' ? [320, 320] : [1500, 300];
      const blob = await cropImage(file, w, h);
      const url = await storageUpload(kind === 'avatar' ? 'avatars' : 'banners', `${uid}/${kind}.jpg`, blob, 'image/jpeg');
      await save({ [kind === 'avatar' ? 'avatar_url' : 'banner_url']: url });
    } catch (e) {
      toast(`Загрузка не удалась: ${(e as Error).message}`);
    }
    setBusy('');
  };

  const unlockedList = ACHIEVEMENTS.filter((a) => unlocked[a.id]);

  return (
    <section className="settings__card">
      <h2>Профиль</h2>
      <div className="profile-form">
        <label className="field">
          <span className="field__label">Имя пользователя (публичный адрес /profile/имя)</span>
          <input className="input" value={username} maxLength={24} onChange={(e) => setUsername(e.target.value.replace(/[^a-z0-9_-]/gi, ''))} placeholder="nickname" />
        </label>
        <label className="field">
          <span className="field__label">О себе (до 200 символов)</span>
          <textarea className="input" rows={3} maxLength={200} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Пара слов о ваших вкусах" />
        </label>
        <div className="profile-form__row">
          <label className="btn btn--outline btn--md">
            {busy === 'avatar' ? '…' : 'Загрузить аватар (320×320)'}
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload('avatar', e.target.files[0])} />
          </label>
          <label className="btn btn--outline btn--md">
            {busy === 'banner' ? '…' : 'Загрузить баннер (1500×300)'}
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload('banner', e.target.files[0])} />
          </label>
        </div>
        <div className="profile-form__gradients" aria-label="Пресетные градиенты баннера">
          {BANNER_GRADIENTS.map((g, i) => (
            <button key={g} type="button" className="grad-swatch" style={{ background: g }} aria-label={`Градиент ${i + 1}`} onClick={() => save({ banner_url: `grad:${i}` })} />
          ))}
        </div>
        {unlockedList.length ? (
          <div className="profile-form__badges">
            <span className="field__label">Бейджи на профиле (до 3)</span>
            <div className="chips chips--check">
              {unlockedList.map((a) => (
                <label key={a.id} className={`chip chip--check ${pinned.includes(a.id) ? 'is-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={pinned.includes(a.id)}
                    onChange={(e) => {
                      const next = e.target.checked ? [...pinned, a.id].slice(-3) : pinned.filter((x) => x !== a.id);
                      setPinned(next);
                    }}
                  />
                  <span>{a.title}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="settings__note">Бейджи-ачивки появятся после первых достижений (раздел «Достижения»).</p>
        )}
        <div className="settings__actions">
          <button className="btn btn--primary btn--md" disabled={!!busy} onClick={() => save({})}>
            {busy === 'save' ? '…' : 'Сохранить профиль'}
          </button>
          <a className="btn btn--outline btn--md" href="/profile/stats">
            📊 Моя статистика
          </a>
          <a className="btn btn--outline btn--md" href="/profile/achievements">
            🏆 Мои достижения
          </a>
          {!isSessionValid() ? <span className="settings__note">Нужен вход: данные профиля хранятся в Supabase.</span> : null}
        </div>
      </div>
    </section>
  );
}
