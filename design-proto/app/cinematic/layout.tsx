import '../concepts/cinematic.css';

export const metadata = {
  title: { default: 'Nova Cinematic' },
};

export default function CinematicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-concept="cinematic">
      <a className="skip-link" href="#content">
        К содержанию
      </a>
      {children}
    </div>
  );
}
