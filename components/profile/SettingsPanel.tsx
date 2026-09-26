'use client';

import { useState } from 'react';
import { library, useLibrary } from '@/lib/library';
import { ACCENTS } from '@/lib/labels';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toaster';
import { SyncSection } from './SyncSection';
import { PushButton } from './PushButton';

export function SettingsPanel() {
  const [pick, setPick] = useState<string>(() => library.state.settings.customAccent ?? '#8b5cf6');
  const { settings, bookmarks, history } = useLibrary();
  const toast = useToast();

  return (
    <div className="settings">
      <section className="settings__card">
        <h2>Профиль</h2>
        <label className="field">
          <span className="field__label">Имя для отзывов и комментариев</span>
          <input
            className="input"
            defaultValue={settings.displayName ?? ''}
            placeholder="Гость"
            maxLength={40}
            onBlur={(e) => library.setSettings({ displayName: e.target.value.trim() || undefined })}
          />
        </label>
      </section>

      <section className="settings__card">
        <h2>Плеер</h2>
        <Switch
          label="Автопереход к следующей серии"
          checked={settings.autoplayNext}
          onChange={(v) => library.setSettings({ autoplayNext: v })}
        />
        <Switch
          label="Меньше анимаций (reduce motion)"
          checked={settings.reduceMotion}
          onChange={(v) => library.setSettings({ reduceMotion: v })}
        />
        <Switch
          label="ТВ-режим: навигация стрелками (D-pad)"
          checked={settings.tvMode}
          onChange={(v) => library.setSettings({ tvMode: v })}
        />
        <label className="field">
          <span className="field__label">Провайдер плеера по умолчанию</span>
          <span className="field__hint">Какой источник использовать первым. Demo — тестовый поток, всегда работает.</span>
          <select
            className="input"
            value={settings.defaultProvider}
            onChange={(e) => library.setSettings({ defaultProvider: e.target.value })}
          >
            <option value="demo">AniNova Demo (без ключей)</option>
            <option value="kodik">Kodik (нужен KODIK_TOKEN)</option>
            <option value="aniboom">Aniboom (в разработке)</option>
          </select>
        </label>
      </section>

      <section className="settings__card">
        <h2>Акцент интерфейса</h2>
        <div className="settings__accents">
          {Object.entries(ACCENTS).map(([id, a]) => (
            <button
              key={id}
              type="button"
              className={`accent-swatch ${settings.accent === id ? 'is-active' : ''}`}
              style={{ background: `linear-gradient(135deg, ${a.a}, ${a.b})` }}
              aria-label={`Акцент: ${a.label}`}
              aria-pressed={settings.accent === id}
              onClick={() => library.setSettings({ accent: id })}
            >
              {settings.accent === id ? <span>✓</span> : null}
            </button>
          ))}
        </div>
        <p className="settings__note">Цвет применяется мгновенно и хранится локально.</p>
      </section>

      <SyncSection />

      <section className="settings__card">
        <h2>Уведомления</h2>
        <p className="settings__note">Пуш в день выхода новых серий просмотренных/отложенных тайтлов.</p>
        <PushButton />
      </section>

      <section className="settings__card settings__card--danger">
        <h2>Данные</h2>
        <p className="settings__note">
          Закладок: {bookmarks.length} · записей истории: {history.length}. Всё хранится только в вашем браузере.
        </p>
        <div className="settings__actions">
          <button
            className="btn btn--outline btn--md"
            onClick={() => {
              library.clearHistory();
              toast('История очищена');
            }}
          >
            Очистить историю
          </button>
          <button
            className="btn btn--danger btn--md"
            onClick={() => {
              library.clearAll();
              toast('Локальные данные удалены');
            }}
          >
            Удалить всё
          </button>
        </div>
      </section>
    </div>
  );
}
