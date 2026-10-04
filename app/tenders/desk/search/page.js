import { SearchResults } from './SearchResults';

export const dynamic = 'force-dynamic';

export default async function SearchPage({ searchParams }) {
  const params = await searchParams;
  const q = params.q || '';
  const filters = typeof params.filters === 'string' ? params.filters : '';
  return <SearchResults query={q} savedFilters={filters} />;
}
