import '../concepts/editorial.css';

export const metadata = {
  title: { default: 'Nova Editorial' },
};

export default function EditorialLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-concept="editorial">
      <a className="skip-link" href="#content">
        К содержанию
      </a>
      {children}
    </div>
  );
}
