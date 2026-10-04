import { formatINR } from './format';
import { formatISTDate } from './ist';

/**
 * The internal application letter, addressed to the refund office. Blanks stay
 * only when a fact is missing; the gate should already have caught that.
 */
export function buildLetter({ kind = 'SD', tender, office, instruments, firmName }) {
  const b = (v) => (v == null || v === '' ? '________' : String(v));
  const subjectWhat = kind === 'EMD' ? 'Earnest Money Deposit' : 'Security Deposit';
  const lines = [];
  lines.push('To');
  lines.push(b(office.officerName));
  lines.push(b(office.officeName));
  lines.push(b(office.officeDept));
  lines.push(b(office.officeAddress));
  lines.push(`${b(office.officeDistrict)}, ${b(office.officeState)}`);
  lines.push('');
  lines.push(`Subject: Release of ${subjectWhat} for ${b(tender.title)}`);
  lines.push(`Reference: ${b(tender.portalTenderId)} / ${b(tender.referenceNo)}`);
  lines.push('');
  lines.push('Sir or Madam,');
  lines.push('');
  if (kind === 'EMD') {
    lines.push(`We submitted a bid for the work “${b(tender.title)}” with the Earnest Money Deposit noted below.`);
    lines.push('The work was not awarded to us and the deposit is due for return.');
  } else {
    lines.push(`The work “${b(tender.title)}” was awarded to us for ${tender.awardedValue != null ? formatINR(tender.awardedValue) : '₹________'}.`);
    lines.push(
      `The completion certificate number ${b(tender.completionCertNo)} dated ${tender.completionDate ? formatISTDate(tender.completionDate) : '________'}`
    );
    lines.push('is enclosed.');
  }
  lines.push('');
  lines.push(`The following ${subjectWhat} is held with your office and is requested back:`);
  lines.push('');
  for (const i of instruments) {
    lines.push(
      `- ${b(i.form)} number ${b(i.number)} dated ${i.instrumentDate ? formatISTDate(i.instrumentDate) : '________'}, for ${formatINR(i.amount)}, drawn on ${b(i.bank)}`
    );
  }
  lines.push('');
  lines.push(`Kindly release the ${subjectWhat} to us.`);
  lines.push('');
  lines.push('Yours faithfully');
  lines.push(b(firmName));
  return lines.join('\n');
}
