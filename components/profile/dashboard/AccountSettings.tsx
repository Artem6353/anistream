'use client';

import { useRef, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { humanizeAuthError, validateBio, validateUsername } from '@/lib/auth/validation';
import { useToast } from '@/components/ui/Toaster';
import type { ProfileRow } from '@/lib/profile/data';
import { library, useLibrary } from '@/lib/library';

type Theme = 'dark' | 'light' | 'system';

/* Должно совпадать с file_size_limit бакета avatars (2 MB), иначе Storage
   отклонит файл уже после загрузки. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Настройки аккаунта: ник, био, аватар в Supabase Storage и тема интерфейса.
 *
 * Аватар кладём в бакет `avatars` в папку `<uid>/` — RLS-политика из миграции 004
 * разрешает запись только туда. Файл не «путешествует» через сервер приложения:
 * браузер грузит его напрямую в Storage по сессионной cookie, поэтому лишних
 * копий и токенов в нашем коде нет.
 */
export function AccountSettings({ profile, email }: { profile: ProfileRow | null; email: string | null }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  /* Тема живёт в общем сторе настроек (lib/library) — его слушает ThemeInit,
     который применяет data-theme к <html>. Дублировать DOM-запись здесь нельзя:
     получились бы две правды и мигание при гидратации. */
  const { settings } = useLibrary();
  const theme = (settings.theme ?? 'system') as Theme;
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<{ username?: string | null; bio?: string | null }>({});

  const applyTheme = (next: Theme) => {
    library.setSettings({ theme: next });
    toast(`Тема: ${next === 'system' ? 'как в системе' : next === 'light' ? 'светлая' : 'тёмная'}`);
  };

  const saveProfile = async () => {
    if (savingProfile) return;
    const usernameError = username.trim() && username.trim() !== profile?.username ? validateUsername(username) : null;
    const bioError = validateBio(bio);
    setErrors({ username: usernameError, bio: bioError });
    if (usernameError || bioError) {
      toast.error(usernameError ?? bioError ?? 'Проверьте поля');
      return;
    }

    const supabase = getBrowserSupabase();
    if (!supabase) {
      toast.error('Supabase не настроен');
      return;
    }
    setSavingProfile(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error('Сессия истекла — войдите заново');

      const payload = {
        user_id: userId,
        username: username.trim() || null,
        bio: bio.trim(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
      if (error) {
        // Уникальность ника в БД: переводим ошибку в понятный текст.
        if (error.code === '23505' || error.message.includes('duplicate key')) {
          throw new Error('Этот ник уже занят — выберите другой');
        }
        throw new Error(humanizeAuthError(error.message, error.code));
      }
      toast('Профиль сохранён');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить профиль');
    } finally {
      setSavingProfile(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (uploading) return;
    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      toast.error('Нужен PNG, JPEG или WebP');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('Файл больше 2 МБ — сожмите картинку');
      return;
    }

    const supabase = getBrowserSupabase();
    if (!supabase) {
      toast.error('Supabase не настроен');
      return;
    }
    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error('Сессия истекла — войдите заново');

      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      // Имя с timestamp — чтобы CDN не отдавал старый кэш после смены аватара.
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
        cacheControl: '31536000',
        upsert: true,
        contentType: file.type,
      });
      if (uploadError) throw new Error(uploadError.message);

      /* Каждый аплоад — новый файл: старый URL остаётся в кэше CDN живым, поэтому
         версия в имени обязательна. Старые файлы пользователя не удаляем (объём
         копеечный), но и не переиспользуем имя — иначе CDN полгода отдаёт прошлое фото. */
      const { data: publicUrl } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = publicUrl.publicUrl;
      const { error: dbError } = await supabase
        .from('profiles')
        .upsert({ user_id: userId, avatar_url: url, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (dbError) throw new Error(dbError.message);

      setAvatarUrl(url);
      toast('Аватар обновлён');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Загрузка не удалась');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="settings">
      <section className="ds-card ds-card--pad settings__block">
        <h2 className="settings__title">Аватар</h2>
        <div className="settings__avatar-row">
          <span className="ds-avatar settings__avatar" aria-hidden="true">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" width={88} height={88} />
            ) : (
              (username || email || 'A').slice(0, 1).toUpperCase()
            )}
          </span>
          <div className="settings__avatar-actions">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_AVATAR_TYPES.join(',')}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAvatar(file);
              }}
            />
            <button type="button" className="ds-btn ds-btn--ghost" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading && <span className="ds-spinner" aria-hidden="true" />}
              {uploading ? 'Загружаем…' : 'Загрузить фото'}
            </button>
            <p className="ds-muted">PNG/JPEG/WebP до 2 МБ. Хранится в Supabase Storage, бакет «avatars».</p>
          </div>
        </div>
      </section>

      <section className="ds-card ds-card--pad settings__block">
        <h2 className="settings__title">Профиль</h2>
        <div className="settings__grid">
          <label className="ds-field">
            <span className="ds-field__label">Ник</span>
            <input
              className={`ds-input${errors.username ? ' has-error' : ''}`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => setErrors((s) => ({ ...s, username: username.trim() ? validateUsername(username) : null }))}
              placeholder="kirito_fan"
              autoComplete="nickname"
            />
            {errors.username ? (
              <span className="ds-field__error">{errors.username}</span>
            ) : (
              <span className="ds-field__hint">Отображается в отзывах и публичном профиле</span>
            )}
          </label>

          <label className="ds-field">
            <span className="ds-field__label">Био</span>
            <textarea
              className="ds-textarea"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
              rows={3}
              placeholder="Люблю сёнены и опенинги 90-х"
            />
            <span className="ds-field__hint">{bio.length}/280</span>
          </label>
        </div>

        <div className="settings__actions">
          <button type="button" className="ds-btn ds-btn--primary" onClick={saveProfile} disabled={savingProfile}>
            {savingProfile && <span className="ds-spinner" aria-hidden="true" />}
            Сохранить
          </button>
        </div>
      </section>

      <section className="ds-card ds-card--pad settings__block">
        <h2 className="settings__title">Тема интерфейса</h2>
        <div className="ds-segment settings__theme" role="group" aria-label="Тема оформления">
          {(['dark', 'light', 'system'] as Theme[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`ds-segment__item${theme === option ? ' is-active' : ''}`}
              aria-pressed={theme === option}
              onClick={() => applyTheme(option)}
            >
              {option === 'dark' ? 'Тёмная' : option === 'light' ? 'Светлая' : 'Как в системе'}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

