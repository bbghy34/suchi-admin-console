import Link from 'next/link';

const SEARCHES = [
  'Road construction in Assam',
  'Water supply in Meghalaya',
  'School buildings in Tripura',
  'GeM bid Assam furniture supply',
];

/** Plain navigation: showing suggestions never starts a paid search. */
export function SuggestedSearches() {
  return (
    <nav aria-label="Suggested tender searches" className="mt-4 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs text-mat-dim">Suggested searches</span>
      {SEARCHES.map(query => (
        <Link key={query} href={`/tenders/desk/search?q=${encodeURIComponent(query)}`} prefetch={false} className="d-pill">{query}</Link>
      ))}
    </nav>
  );
}
