import '../concepts/minimal.css';

export const metadata = {
  title: { default: 'Nova Minimal' },
};

/* Корень концепции A: только токены/тему и доступность. Шапка и футер живут
   в группе (shell), чтобы читалка комикса оставалась без интерфейса сайта. */
export default function MinimalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-concept="minimal" className="m-app">
      <a className="skip-link" href="#content">
        К содержанию
      </a>
      {children}
    </div>
  );
}
