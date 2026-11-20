/* Nova Pulse — фирменный элемент AniNova 3.0.
   Один элемент, одно значение: точка + расходящееся кольцо. Используется
   сдержанно: логотип, статус «в эфире», активный пункт навигации, прогресс.
   Анимация отключается при prefers-reduced-motion (см. globals.css). */
export function Pulse({
  live = false,
  size,
  className,
}: {
  live?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`pulse${live ? ' pulse--live' : ''}${className ? ` ${className}` : ''}`}
      style={size ? ({ '--pulse-size': `${size}px` } as React.CSSProperties) : undefined}
      aria-hidden="true"
    />
  );
}
