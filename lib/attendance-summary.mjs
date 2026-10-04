/** Summarise all records matching the API filter, independent of pagination. */
export function attendanceSummary(records, now = Date.now()) {
  let totalMinutes=0, activeCheckedIn=0, flagged=0;
  for(const record of records) {
    if(!record.checkOutTime) activeCheckedIn++;
    if(record.isFlagged) flagged++;
    const start=new Date(record.checkInTime).getTime();
    const end=record.checkOutTime ? new Date(record.checkOutTime).getTime() : now;
    if(Number.isFinite(start) && Number.isFinite(end) && end>=start) totalMinutes+=Math.floor((end-start)/60000);
  }
  const avg=records.length ? Math.round(totalMinutes/records.length) : 0;
  return {total:records.length,activeCheckedIn,flagged,totalMinutes,totalHoursText:`${Math.floor(totalMinutes/60)}h ${totalMinutes%60}m`,avgHoursText:`${Math.floor(avg/60)}h ${avg%60}m`};
}
