import test from 'node:test';import assert from 'node:assert/strict';
import {hideLuitAdminOnTender,hideLuitAdminOnFetch} from '../lib/luit-admin/privacy.mjs';
test('Luit admin tender actors disappear without deleting business documents or source audit objects',()=>{
 const hidden=new Set(['sx-person']);const tender={id:'t',title:'Public work',createdById:'sx-person',documents:[{id:'d',uploadedById:'sx-person',uploadedBy:{id:'sx-person',name:'Hidden Admin'}}],activities:[{personId:'sx-person',detail:'Hidden Admin selected tender'},{personId:'normal',detail:'Visible change'}],selections:[{personId:'sx-person'},{personId:'normal'}],checklist:[{addedById:'sx-person',ticks:[{personId:'sx-person'},{personId:'normal'}]}]};
 const visible=hideLuitAdminOnTender(tender,hidden);assert.equal(visible.createdById,null);assert.equal(visible.documents.length,1);assert.equal(visible.documents[0].uploadedBy,null);assert.equal(visible.activities.length,1);assert.equal(visible.selections.length,1);assert.equal(visible.checklist[0].ticks.length,1);assert.doesNotMatch(JSON.stringify(visible),/sx-person|Hidden Admin/);assert.equal(tender.documents[0].uploadedBy.name,'Hidden Admin');
});
test('Luit admin fetch completion remains complete without naming accountable employee',()=>{
 const log={personId:'sx',person:{id:'sx',name:'Hidden'},outcome:'UPLOADED'};const result=hideLuitAdminOnFetch(log,new Set(['sx']));assert.equal(result.outcome,'UPLOADED');assert.equal(result.personId,null);assert.equal(result.person,null);assert.equal(log.personId,'sx');
});
