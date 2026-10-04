import { redirect } from 'next/navigation';
import { getCurrentPerson } from '@/lib/desk/auth';
import { peoplePageData } from '@/lib/desk/desk';
import { asJson } from '@/lib/desk/json';
import { PeopleDesk } from './PeopleDesk';

export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  const person = await getCurrentPerson();
  if (!person.isAdmin) redirect('/');
  const data = await peoplePageData();
  return <PeopleDesk {...asJson(data)} />;
}
