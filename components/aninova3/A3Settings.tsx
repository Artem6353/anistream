'use client';

import { useState } from 'react';
import { library, useLibrary } from '@/lib/library';
import { useA3Ui } from '@/components/aninova3/A3Ui';
import { SyncSection } from '@/components/profile/SyncSection';

type Confirm = 'history' | 'all' | null;

/** B2-D: настройки preview на тех же localStorage-ключах, что production.
 *  Никакой второй системы настроек: theme/accent зафиксированы dark-preview,
 *  а ТВ-переключатель — единственный и управляет A3Ui, который читает shell. */
export function A3Settings() {
  const { settings, bookmarks, history } = useLibrary();
  const { tv, setTv } = useA3Ui();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [feedback, setFeedback] = useState('');

  const setTvMode = (value: boolean) => {
    setTv(value);
    library.setSettings({ tvMode: value });
  };

  const clearHistory = () => {
    library.clearHistory();
    setConfirm(null);
    setFeedback('История просмотров очищена. Закладки не тронуты.');
  };

  const clearAll = () => {
    library.clearLocalData();
    setTv(false);
    setConfirm(null);
    setFeedback('Локальные данные удалены: закладки, история, списки и настройки сброшены.');
  };

  return (
    <div className="a3-settings-page">
      <section className="a3-settings-card" aria-labelledby="settings-player-title">
        <div className="a3-settings-card__head">
          <p className="a3-kicker">Плеер</p>
          <h2 id="settings-player-title">Воспроизведение и интерфейс</h2>
        </div>
        <label className="a3-settings-row">
          <span>
            <strong>Автопереход к следующей серии</strong>
            <span className="a3-muted">Включать следующую серию после окончания текущей.</span>
          </span>
          <input
            type="checkbox"
            checked={settings.autoplayNext}
            onChange={(e) => library.setSettings({ autoplayNext: e.target.checked })}
          />
        </label>
        <label className="a3-settings-row">
          <span>
            <strong>Меньше анимаций</strong>
            <span className="a3-muted">Уменьшает движение в интерфейсе. Системная настройка «уменьшить движение» тоже учитывается.</span>
          </span>
          <input
            type="checkbox"
            checked={settings.reduceMotion}
            onChange={(e) => library.setSettings({ reduceMotion: e.target.checked })}
          />
        </label>
        <label className="a3-settings-row">
          <span>
            <strong>ТВ-режим и D-pad</strong>
            <span className="a3-muted">Крупные цели и перемещение стрелками. Тот же режим, что кнопка «ТВ» в шапке.</span>
          </span>
          <input type="checkbox" checked={tv} onChange={(e) => setTvMode(e.target.checked)} />
        </label>
        <label className="a3-settings-row a3-settings-row--stack">
          <span>
            <strong>Провайдер плеера по умолчанию</strong>
            <span className="a3-muted">Источник, который выбирается первым, если он доступен.</span>
          </span>
          <select
            className="a3-input"
            value={settings.defaultProvider}
            onChange={(e) => library.setSettings({ defaultProvider: e.target.value })}
          >
            <option value="demo">AniNova Demo (без ключей)</option>
            <option value="kodik">Kodik (нужен KODIK_TOKEN)</option>
            <option value="aniboom">Aniboom (в разработке)</option>
          </select>
        </label>
        <p className="a3-settings-note">
          Тема и акцент в preview зафиксированы тёмными. Настройка акцента недоступна, чтобы не показывать неработающий переключатель.
        </p>
      </section>

      <div className="a3-settings-card a3-settings-card--sync">
        <SyncSection preview />
      </div>

      <section className="a3-settings-card a3-settings-card--danger" aria-labelledby="settings-data-title">
        <div className="a3-settings-card__head">
          <p className="a3-kicker">Данные на устройстве</p>
          <h2 id="settings-data-title">Локальная библиотека</h2>
        </div>
        <p className="a3-muted">
          Закладок: <strong>{bookmarks.length}</strong> · записей истории: <strong>{history.length}</strong>. Всё хранится только в вашем браузере и привязано к текущему аккаунту.
        </p>
        <div className="a3-settings-actions">
          <button className="a3-btn" type="button" onClick={() => setConfirm('history')} disabled={!history.length}>
            Очистить историю
          </button>
          <button className="a3-btn a3-btn--danger" type="button" onClick={() => setConfirm('all')}>
            Удалить локальные данные
          </button>
        </div>
        {confirm ? (
          <div className="a3-confirm" role="alert" aria-labelledby="settings-confirm-title">
            <p id="settings-confirm-title">
              {confirm === 'history'
                ? 'Очистить всю историю просмотров? Это действие нельзя отменить.'
                : 'Удалить закладки, историю, списки и локальные настройки? Это действие нельзя отменить.'}
            </p>
            <div className="a3-confirm__actions">
              <button className="a3-btn a3-btn--danger" type="button" onClick={confirm === 'history' ? clearHistory : clearAll}>
                {confirm === 'history' ? 'Да, очистить историю' : 'Да, удалить всё'}
              </button>
              <button className="a3-btn a3-btn--ghost" type="button" onClick={() => setConfirm(null)}>
                Отмена
              </button>
            </div>
          </div>
        ) : null}
        <p className="a3-settings-feedback" role="status" aria-live="polite">{feedback}</p>
        <p className="a3-settings-note">
          Сброс настроек возвращает значения по умолчанию, но не удаляет аккаунт и серверные данные.
        </p>
      </section>
    </div>
  );
}
