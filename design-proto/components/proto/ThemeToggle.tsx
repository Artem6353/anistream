'use client';

import { Icon } from './Icon';
import { useProtoTheme } from './useProtoTheme';

/* Переключатель темы. Разметка одна, вид — из токенов концепции (className).
   Кнопка всегда имеет доступное имя: видимая подпись или sr-only текст. */
export function ThemeToggle({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { theme, toggle } = useProtoTheme();
  const label = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      aria-label={label}
      title={label}
      data-theme-toggle
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
      {showLabel ? <span>{theme === 'dark' ? 'Светлая' : 'Тёмная'}</span> : null}
    </button>
  );
}
