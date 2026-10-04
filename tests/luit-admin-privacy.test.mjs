import test from 'node:test';
import assert from 'node:assert/strict';
import {redactActorFields,redactLuitAdmin,hideLuitAdminResponse} from '../lib/luit-admin/privacy.mjs';
const accounts=[{id:'sx-id',name:'Private Operator',uniqueName:true},{id:'sx-duplicate',name:'Common Name',uniqueName:false}];
test('exact hidden actor IDs and related names disappear while business data and source are unchanged',()=>{
 const source={id:'bill',createdBy:'sx-id',updatedBy:'staff',creator:{id:'sx-id',name:'Private Operator'},editor:{id:'staff',name:'Other'},approvedBy:'Private Operator',requestedBy:'Common Name',description:'Private Operator signed this document',party:{id:'party',name:'Private Operator'},metadata:{createdBy:'sx-id'},rows:[{managerId:'sx-id',manager:{id:'sx-id',name:'Private Operator'}}]};
 const masked=redactActorFields(source,accounts);
 assert.equal(masked.createdBy,null);assert.equal(masked.creator,null);assert.equal(masked.approvedBy,null);assert.equal(masked.rows[0].manager,null);assert.equal(masked.rows[0].managerId,null);
 assert.equal(masked.updatedBy,'staff');assert.equal(masked.editor.name,'Other');assert.equal(masked.requestedBy,'Common Name');assert.equal(masked.party.name,'Private Operator');assert.equal(masked.description,source.description);assert.deepEqual(masked.metadata,source.metadata);assert.equal(source.createdBy,'sx-id');assert.equal(source.creator.name,'Private Operator');
});
test('known actor ID masks linked display fields even when relation only contains name',()=>{
 const p=redactActorFields({createdBy:'sx-id',creator:{name:'Private Operator'},createdByName:'Private Operator',employee:{id:'sx-id',name:'Private Operator'},createdById:'sx-id'},new Set(['sx-id']));
 assert.deepEqual(p,{createdBy:null,creator:null,createdByName:null,employee:null,createdById:null});
});
test('typed values and non-actor names remain intact',()=>{
 const date=new Date(), bytes=Buffer.from('PDF');const r=redactActorFields({date,bytes,amount:12n,name:'Private Operator',remarks:'sx-id',sourceUrl:'https://example.test/sx-id'},accounts);
 assert.equal(r.date,date);assert.equal(r.bytes,bytes);assert.equal(r.amount,12n);assert.equal(r.name,'Private Operator');assert.equal(r.remarks,'sx-id');
});
test('async serializer uses parameterized SX evidence without auth queries or writes',async()=>{
 let calls=0;const db={$queryRaw:async(strings,...values)=>{calls++;assert.deepEqual(values,['SX']);assert.match(strings.join('?'),/NOT EXISTS/);return accounts;}};
 const data=await redactLuitAdmin(db,{createdBy:'sx-id',total:20});assert.deepEqual(data,{createdBy:null,total:20});assert.equal(calls,1);
 const response=await hideLuitAdminResponse(db,(data,message,status,extra)=>({data,message,status,extra}),{approvedBy:'sx-id'},'Saved',201,{pagination:{total:1}});
 assert.deepEqual(response,{data:{approvedBy:null},message:'Saved',status:201,extra:{pagination:{total:1}}});
});
test('ambiguous or unknown actors do not disappear based only on role-like text',()=>{
 assert.deepEqual(redactActorFields({approvedBy:'Common Name',createdBy:'unknown',creator:{id:'unknown',role:'SX'},name:'sx-id'},accounts),{approvedBy:'Common Name',createdBy:'unknown',creator:{id:'unknown',role:'SX'},name:'sx-id'});
});

test('Desk person actor references are masked using a separate exact Person-ID set',()=>{
 const r=redactActorFields({id:'tender',personId:'hidden-person',person:{id:'hidden-person',name:'Private'},addedById:'hidden-person',uploadedById:'hidden-person',uploadedBy:{id:'hidden-person'},sitManager:'hidden-person'},new Set(['hidden-person']));
 assert.deepEqual(r,{id:'tender',personId:null,person:null,addedById:null,uploadedById:null,uploadedBy:null,sitManager:null});
});

test('legacy encoded delivery-image actors masked without parsing business text',()=>{
 const encoded=JSON.stringify([{imageLink:'/api/files/image.jpg',createdBy:'sx-id'}]);
 const r=redactActorFields({itemReceivedImage:encoded,images:encoded,description:encoded},accounts);
 assert.equal(JSON.parse(r.itemReceivedImage)[0].createdBy,null);assert.equal(JSON.parse(r.images)[0].createdBy,null);assert.equal(r.description,encoded);
});

test('uppercase department HOD identity is masked without dropping department data',()=>{
 assert.deepEqual(redactActorFields({department:{id:'dept',name:'Engineering',HOD:'sx-id'}},accounts),{department:{id:'dept',name:'Engineering',HOD:null}});
});
