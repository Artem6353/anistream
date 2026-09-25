import type { Metadata } from 'next';
import { searchTitles } from '@/lib/catalog';
import { PosterGrid } from '@/components/anime/PosterGrid';
import { SearchForm } from '@/components/layout/SearchForm';

export const metadata: Metadata = {
  title: 'Поиск',
  description: 'Поиск по каталогу AniNova: русские и ромадзи-названия, жанры, годы.',
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  const results = query ? searchTitles(query, 48) : [];

  return (
    <div className="container">
      <header className="page-head">
        <h1>Поиск</h1>
        <p>Ищем по русскому названию, ромадзи, английскому имени и жанрам.</p>
      </header>
      <SearchForm initial={query} />
      {query ? (
        results.length ? (
          <>
            <p className="search-count">Нашлось: {results.length}</p>
            <PosterGrid titles={results} />
          </>
        ) : (
          <div className="empty-state">
            <h2>Пусто</h2>
            <p>По запросу «{query}» ничего нет. Попробуйте короче: «фрирен», «клинок», «меха».</p>
          </div>
        )
      ) : (
        <div className="empty-state">
          <h2>Начните вводить запрос</h2>
          <p>Например: «Фрирен», «Sousou», «романтика 2024» или «Твоё имя».</p>
        </div>
      )}
    </div>
  );
}
