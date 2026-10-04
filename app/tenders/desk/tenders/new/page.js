import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function NewTenderPage({ searchParams }) {
  const params = await searchParams;
  const sourceId = params.sourceId ? `?sourceId=${encodeURIComponent(params.sourceId)}` : '';
  redirect(`/boatbrothers/upload${sourceId}`);
}
