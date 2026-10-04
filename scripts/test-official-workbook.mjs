import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { extractOfficialDocument } from '../lib/desk/portal-import/extract.mjs';
function fixture({ printArea = "'BoQ One'!$A$1:$D$4", macro = false } = {}) {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Lighting works', 'Quantity', 'Template rate', 'Bid total'],
    ['Pole', 10, 987654, 0],
    ['Hidden setting', 5, 123],
    ['Cable', 130, 888],
  ]);
  sheet.D2 = { t: 'n', v: 0, f: 'B2*C2' };
  sheet.IE20 = { t: 's', v: 'Unrelated sluice valve template' };
  sheet['!ref'] = 'A1:IE20';
  sheet['!cols'] = [{}, {}, { hidden: true }, {}];
  sheet['!rows'] = [{}, {}, { hidden: true }, {}];
  XLSX.utils.book_append_sheet(book, sheet, 'BoQ One');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Enable macros to display worksheet']]), 'Macros');
  book.Workbook = { Sheets: [{name:'BoQ One', Hidden:2}, {name:'Macros', Hidden:0}], Names: [{ Name:'_xlnm.Print_Area', Sheet:0, Ref:printArea }] };
  if (macro) book.vbaraw = Buffer.from('synthetic inert VBA marker; no executable test code');
  return XLSX.write(book, { type:'buffer', bookType: macro ? 'xlsm' : 'xlsx', cellStyles:true });
}
test('retains hidden BOQ sheet and separates hidden rates / outside print template',async()=>{
  const r=await extractOfficialDocument(fixture(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','test.xlsx');
  const s=r.metadata.sheets[0];
  assert.equal(s.visibility,'very hidden');assert.equal(s.hidden,2);assert.deepEqual(s.hiddenColumns,['C']);assert.deepEqual(s.hiddenRows,[3]);
  assert.equal(s.cells.C2.v,987654);assert.equal(s.cells.D2.f,'B2*C2');assert.equal(s.cells.IE20.v,'Unrelated sluice valve template');
  assert.equal(r.metadata.definedNames[0].Ref,"'BoQ One'!$A$1:$D$4");assert.ok(s.appliedPrintRange);
  const primary=r.text.split('PRIMARY VISIBLE CELLS\n')[1].split('SUPPLEMENTARY')[0];
  assert.match(primary,/A2: Pole/);assert.match(primary,/B2: 10/);assert.doesNotMatch(primary,/987654|Unrelated sluice|Hidden setting/);
  assert.match(r.text,/SUPPLEMENTARY HIDDEN ROW\/COLUMN CELLS/);assert.match(r.text,/C2: 987654/);assert.match(r.text,/SUPPLEMENTARY CELLS OUTSIDE THE PRINT AREA/);assert.match(r.text,/IE20: Unrelated sluice/);
  assert.match(r.text,/zero totals do not establish the estimated tender value/);assert.equal(r.metadata.formulasEvaluated,false);
});
test('unrecognized union print range never drops requirements',async()=>{
  const r=await extractOfficialDocument(fixture({printArea:"'BoQ One'!$A$1:$B$2,'BoQ One'!$D$1:$D$4"}),'application/octet-stream','test.xlsx');
  assert.equal(r.metadata.sheets[0].appliedPrintRange,null);assert.match(r.text,/IE20: Unrelated sluice valve template/);assert.match(r.text,/No single usable print area/);
});
test('embedded VBA is detected without evaluating it',async()=>{
  const r=await extractOfficialDocument(fixture({macro:true}),'application/octet-stream','test.xlsx');
  assert.equal(r.metadata.macroPresent,true);assert.equal(r.metadata.macrosExecuted,false);assert.equal(r.metadata.extractionVersion,'workbook-v2');
});
