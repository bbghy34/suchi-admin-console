const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
/** Search citations are hints, not official download availability. Parse only labeled closing dates. */
export function citedClosingStatus(row = {}, now = Date.now()) {
  const text = String(row.detail || '').replace(/[*`]/g, '');
  const pattern = /\b(?:closing\s+date|bid\s+submission\s+end\s+date|last\s+date(?:\s+of\s+submission)?|due\s+date)\s*[:–-]\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[- ](?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[- ,]+\d{4})(?!\d)/gi;
  const dates = new Map();
  for (const match of text.matchAll(pattern)) {
    const value = match[1];
    let year, month, day;
    if (/^\d{4}-/.test(value)) [year,month,day] = value.split('-').map(Number);
    else {
      const parts = value.match(/^(\d{1,2})[- ]([a-z]+)[- ,]+(\d{4})$/i);
      if (!parts) continue;
      day=Number(parts[1]);month=MONTHS.indexOf(parts[2].slice(0,3).toLowerCase())+1;year=Number(parts[3]);
    }
    const date=new Date(Date.UTC(year,month-1,day));
    if(date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day)continue;
    const key=date.toISOString().slice(0,10);
    // Only call it past once the whole cited day has ended in India, even if no time was cited.
    dates.set(key,{date:key,past:now >= Date.UTC(year,month-1,day+1)-330*60000});
  }
  // Conflicting search dates need official verification; never pick one silently.
  return dates.size===1 ? [...dates.values()][0] : null;
}

export function rankByCitedClosing(rows, now = Date.now()) {
  return rows.map((row,index)=>({row,index,closing:citedClosingStatus(row,now)}))
    .sort((a,b)=>Number(!!a.closing?.past)-Number(!!b.closing?.past) || a.index-b.index)
    .map(({row})=>row);
}
