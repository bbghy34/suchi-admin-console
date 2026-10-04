import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../app/api/dashboard/route.js', import.meta.url), 'utf8');
const COUNTS = { totalEmployees: 0, totalContractors: 0, totalSites: 0, todayAttendance: 0, pendingLeaves: 0 };
function load(prisma) {
 prisma.$queryRaw ??= async () => [COUNTS];
 const context = vm.createContext({ prisma, requireAuth: h => h, LUIT_ADMIN_ROLE: 'SX', TENDER_ROLE: 'T',
 hideLuitAdminResponse: async (_db, response, ...args) => response(...args),
 baseSuccessResponse: data => data, handleApiError: e => { throw e; } });
 vm.runInContext(source.replace(/^import .*;\n/gm, '').replace('export const GET', 'globalThis.GET'), context);
 return user => context.GET({}, { user });
}
test('headline counts come from one query that leaves hidden accounts out', async () => {
 const seen = [];
 const empty = async () => [];
 const data = await load({
  $queryRaw: async (strings, ...values) => { seen.push({ sql: strings.join('?'), values }); return [{ totalEmployees: 3, totalContractors: 1, totalSites: 4, todayAttendance: 2, pendingLeaves: 1 }]; },
  contractor:{findMany:empty}, attendance:{findMany:empty}, leave:{findMany:empty}, project:{findMany:empty},
 })({id:'admin',role:'A'});
 assert.equal(seen.length, 1);
 assert.deepEqual([data.kpis.totalEmployees, data.kpis.totalContractors, data.kpis.totalSites, data.kpis.todayAttendance, data.kpis.pendingLeaves], [3, 1, 4, 2, 1]);
 assert.equal(seen[0].values.filter(v => v === 'SX').length, 3);
 assert.equal(seen[0].values.filter(v => v === 'T').length, 3);
});
test('Ongoing and legacy status spellings have consistent active and completed counts', async () => {
 const projects = ['Ongoing','ONGOING','ongoing','Active','In Progress','in_progress',' in-progress ','Completed',' completed ','Planning'].map((status,i) => ({ id: String(i), name: String(i), contractor:'c', status, progress:0, _count:{sites:0} }));
 projects.push({id:'101',name:'Done planning',contractor:'c',status:'Planning',progress:100,_count:{sites:0}});
 projects.push({id:'100', name:'Done', contractor:'c', status:'Ongoing',progress:100,_count:{sites:0}});
 const zero = async () => 0, empty = async () => [];
 const data = await load({ employee:{count:zero}, contractor:{count:zero,findMany:async()=>[{id:'c',name:'Contractor'}]},site:{count:zero}, attendance:{count:zero,findMany:empty},leave:{count:zero,findMany:empty},project:{findMany:async()=>projects} })({id:'admin',role:'A'});
 assert.equal(data.kpis.activeProjects,7);
 assert.equal(data.projectProgress.activeProjectsCount,7);
 assert.equal(data.contractorProjectSummary[0].activeProjects,7);
 assert.equal(data.projectProgress.completedProjectsCount,4);
 assert.equal(data.projectProgress.planningProjectsCount,1);
});
for (const role of ['E','AA']) test(`${role} personal attendance queries exclude inactive records and scope to authenticated employee`, async () => {
 const calls=[];
 const capture = result => async args => { calls.push(args); return result; };
 const data = await load({
 attendance:{findFirst:capture(null),count:capture(2),findMany:capture([])},
 leave:{count:async()=>0,findMany:async()=>[]},
 })({id:'own-employee',role});
 assert.equal(data.isEmployee,true);
 assert.equal(data.kpis.monthlyAttendance,2);
 assert.equal(calls.length,3);
 for (const args of calls) {
  assert.equal(args.where.employeeId,'own-employee');
  assert.equal(args.where.isActive,true);
 }
 assert.ok(Number.isFinite(calls[0].where.checkInTime.gte.getTime()));
 assert.ok(calls[1].where.checkInTime.gte);
});
