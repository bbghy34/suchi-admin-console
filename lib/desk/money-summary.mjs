const HELD = new Set(['SUBMITTED','HELD','RENEWAL_DUE','REFUND_APPLIED']);
const empty = () => ({ emdHeld:0, sdHeld:0, refundRequested:0, refunded:0, toArrange:0, forfeited:0 });
// Aggregate only the caller's already-authorized instruments. Work categories come from saved tender data.
export function summarizeMoney(instruments = []) {
  const totals=empty(), groups=new Map(), seen=new Set();
  for (const instrument of instruments) {
    if (!['EMD','SD'].includes(instrument.category) || instrument.tender?.isSample) continue;
    if (instrument.id && seen.has(instrument.id)) continue;
    if (instrument.id) seen.add(instrument.id);
    const amount=Number(instrument.amount);
    if (!Number.isFinite(amount) || amount<0) continue;
    const category=String(instrument.tender?.workCategory || '').trim() || 'Uncategorized';
    if (!groups.has(category)) groups.set(category,{category,...empty(),projects:new Set()});
    const group=groups.get(category);
    if (instrument.tenderId) group.projects.add(instrument.tenderId);
    // Use paise while summing so ordinary decimal amounts do not accumulate floating point noise.
    const paise=Math.round(amount*100);
    for(const target of [totals,group]) {
      if(HELD.has(instrument.status)) target[instrument.category==='EMD'?'emdHeld':'sdHeld']+=paise;
      if(instrument.status==='REFUND_APPLIED')target.refundRequested+=paise;
      if(instrument.status==='REFUNDED')target.refunded+=paise;
      if(instrument.status==='TO_ARRANGE')target.toArrange+=paise;
      if(instrument.status==='FORFEITED')target.forfeited+=paise;
    }
  }
  const rupees = values => Object.fromEntries(Object.keys(empty()).map(key=>[key,values[key]/100]));
  return {totals:rupees(totals),categories:[...groups.values()].map(group=>({category:group.category,projectCount:group.projects.size,...rupees(group)})).sort((a,b)=>(b.emdHeld+b.sdHeld)-(a.emdHeld+a.sdHeld)||a.category.localeCompare(b.category))};
}
