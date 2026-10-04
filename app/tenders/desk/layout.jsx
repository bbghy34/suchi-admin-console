import { OfficialImportJobsIndicator } from '@/components/desk/OfficialImportJobs';
import { redirect } from 'next/navigation';
import { Geist, Geist_Mono } from 'next/font/google';
import { CommandPalette } from '@/components/desk/CommandPalette';
import { DeskFrame } from '@/components/desk/DeskFrame';
import { DeskNav } from '@/components/desk/DeskNav';
import { getCurrentPerson } from '@/lib/desk/auth';
import { shellData } from '@/lib/desk/desk';

export const dynamic = 'force-dynamic';

const sans = Geist({ subsets: ['latin'], variable: '--desk-font-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--desk-font-mono', display: 'swap' });

export default async function TenderDeskLayout({ children }) {
  const person = await getCurrentPerson();
  if (!person) redirect('/login?redirect=/tenders/desk');
  const shell = await shellData(person);
  return (
    <DeskFrame className={`${sans.variable} ${mono.variable}`}>
      <DeskNav person={person} unread={shell.unread} />
      <div className="mx-auto w-full max-w-7xl px-4 py-2"><OfficialImportJobsIndicator /></div>
      {children}
      <CommandPalette isAdmin={person.isAdmin} canFetch={person.isAdmin || person.isExecutive || person.isAccounts} />
    </DeskFrame>
  );
}
