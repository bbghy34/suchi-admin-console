import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMoney} from '../lib/desk/money-summary.mjs';
const item=(id,category,status,amount,workCategory='Roads')=>({id,tenderId:'project-1',category,status,amount,tender:{workCategory,isSample:false}});
test('separates EMD/SD held and treats refund requested as a subset, not another deposit',()=>{
 const {totals}=summarizeMoney([item('1','EMD','HELD',100),item('2','SD','REFUND_APPLIED',200),item('3','EMD','REFUNDED',50),item('4','SD','TO_ARRANGE',80),item('5','EMD','CONVERTED_TO_SD',200),item('6','SD','FORFEITED',10)]);
 assert.deepEqual(totals,{emdHeld:100,sdHeld:200,refundRequested:200,refunded:50,toArrange:80,forfeited:10});
});
test('work-category grouping uses saved categories and retains uncategorized',()=>{
 const {categories}=summarizeMoney([item('1','EMD','SUBMITTED',10,'Roads'),item('2','SD','HELD',20,'Roads'),{...item('3','SD','HELD',7,''),tenderId:'project-2'}]);
 assert.equal(categories[0].category,'Roads');assert.equal(categories[0].projectCount,1);assert.equal(categories[1].category,'Uncategorized');assert.equal(categories[1].sdHeld,7);
});
test('avoids duplicate instruments, samples, invalid amounts and decimal summing noise',()=>{
 const a=item('1','EMD','HELD',0.1),b=item('2','EMD','HELD',0.2);
 const sample={...item('3','SD','HELD',999),tender:{isSample:true}};
 assert.equal(summarizeMoney([a,a,b,sample,item('4','SD','HELD',NaN),item('5','SD','HELD',-10)]).totals.emdHeld,0.3);
 assert.equal(summarizeMoney([sample]).categories.length,0);
 assert.equal(summarizeMoney([]).totals.sdHeld,0);
});

test('overview renders separate deposit totals, category rows and accurate labels without new tabs',async()=>{
 const fs=await import('node:fs');const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const {default:babel}=await import('next/dist/compiled/babel/core.js');
 const source=fs.readFileSync(new URL('../app/tenders/desk/money/MoneyDesk.jsx',import.meta.url),'utf8');
 const {code}=babel.transformSync(source,{filename:'MoneyDesk.jsx',presets:[['next/babel',{'preset-env':{modules:'commonjs'}}]]});
 const dependencies={'@/lib/desk/format':{formatINR:value=>`INR ${value}`},'@/lib/desk/money':{},'@/lib/desk/constants':{},'@/components/desk/ui':{}};
 const module={exports:{}};Function('require','module','exports',code)(name=>dependencies[name]||require(name),module,module.exports);
 const summary=summarizeMoney([item('1','EMD','HELD',100,''),item('2','SD','HELD',200,'Roads')]);
 const html=renderToStaticMarkup(React.createElement(module.exports.MoneyOverview,{summary}));
 assert.match(html,/EMD held/);assert.match(html,/Security Deposit held/);assert.match(html,/INR 100/);assert.match(html,/INR 200/);assert.match(html,/Uncategorized/);
 assert.match(html,/Refundable deposits are not expenses/);assert.match(html,/Refunded · all time/);
 assert.doesNotMatch(html,/<button/);
});
