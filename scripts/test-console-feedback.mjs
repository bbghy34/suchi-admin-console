import test from 'node:test';
import assert from 'node:assert/strict';
import {attendanceSummary} from '../lib/attendance-summary.mjs';
import {phoneWorkflow} from '../lib/mobile-workflows.mjs';
test('attendance summary includes all matching shifts, ongoing time and flags',()=>{
 const now=Date.parse('2026-09-30T12:00:00Z');
 const rows=[{checkInTime:'2026-09-30T08:00:00Z',checkOutTime:'2026-09-30T10:00:00Z',isFlagged:false},{checkInTime:'2026-09-30T11:00:00Z',checkOutTime:null,isFlagged:true}];
 assert.deepEqual(attendanceSummary(rows,now),{total:2,activeCheckedIn:1,flagged:1,totalMinutes:180,totalHoursText:'3h 0m',avgHoursText:'1h 30m'});
 assert.equal(attendanceSummary([],now).totalMinutes,0);
 assert.equal(attendanceSummary([{checkInTime:'bad',checkOutTime:'bad'}],now).totalMinutes,0);
});
test('phone context is scoped to integrated workflows, not an invented connection',()=>{
 assert.match(phoneWorkflow('/boqs').detail,/delivery photos/i);
 assert.equal(phoneWorkflow('/parties'),null);
 assert.equal(phoneWorkflow('/reports'),null);
});
