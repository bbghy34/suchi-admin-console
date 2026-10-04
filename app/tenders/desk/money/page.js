import { summarizeMoney } from '@/lib/desk/money-summary.mjs';
import { getCurrentPerson } from '@/lib/desk/auth';
import { moneyPageData } from '@/lib/desk/desk';
import { asJson } from '@/lib/desk/json';
import { MoneyDesk } from './MoneyDesk';

export const dynamic = 'force-dynamic';

export default async function MoneyPage() {
  const person = await getCurrentPerson();
  const data = await moneyPageData(person);
  const summary = summarizeMoney([...data.emd, ...data.sd]);
  return <MoneyDesk {...asJson(data)} summary={summary} />;
}
