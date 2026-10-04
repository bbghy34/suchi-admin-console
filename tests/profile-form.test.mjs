import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import babel from 'next/dist/compiled/babel/core.js';
const require = createRequire(import.meta.url);
function compile(source, filename, dependencies={}) {
 const {code} = babel.transformSync(source,{filename,presets:[['next/babel',{'preset-env':{modules:'commonjs'}}]]});
 const module={exports:{}};
 Function('require','module','exports',code)(name=>dependencies[name] || require(name),module,module.exports);
 return module.exports;
}
const validation=compile(readFileSync(new URL('../lib/validation.js',import.meta.url),'utf8'),'validation.js');
const source=readFileSync(new URL('../app/profile/page.js',import.meta.url),'utf8');
const stub=()=>null;
const dependencies=Object.fromEntries([...source.matchAll(/from ['"](@\/[^'"]+)['"]/g)].map(match=>[match[1],new Proxy({},{get:()=>stub})]));
dependencies['@/lib/validation']=validation;
const profile=compile(source.replace('function profileFields','export function profileFields').replace('function profileErrors','export function profileErrors'),'profile.jsx',dependencies);

test('valid phone and international formatted emergency number can save; invalid text is rejected',()=>{
 assert.deepEqual(profile.profileErrors({phone:'9876543210',emergencyNo:'+91 98765 43210'}),{});
 assert.deepEqual(profile.profileErrors({phone:'',emergencyNo:''}),{});
 assert.ok(profile.profileErrors({phone:'abc',emergencyNo:'123'}).phone);
 assert.ok(profile.profileErrors({phone:'abc',emergencyNo:'123'}).emergencyNo);
});
test('profile form normalizes database values and restores structured banking details',()=>{
 const form=profile.profileFields({phone:9876543210,bankDetails:'{"bankName":"Bank","accountNumber":"00123","ifscCode":"TEST0000001"}',aadhar:null});
 assert.equal(form.phone,'9876543210'); assert.equal(form.accountNumber,'00123'); assert.equal(form.ifscCode,'TEST0000001');assert.equal(form.aadhar,'');
 assert.equal(profile.profileFields({bankDetails:'Legacy Bank'}).bankName,'Legacy Bank');
 assert.equal(profile.profileFields({bankDetails:'123'}).bankName,'123');
 assert.equal(profile.profileFields({bankDetails:'null'}).bankName,'null');
 assert.equal(profile.profileFields({bankDetails:null}).bankName,'');
});
test('profile JSX compiles with dirty state, cancel, bounded requests and associated field errors',()=>{
 assert.match(source,/disabled=\{isSaving \|\| !isDirty\}/);
 assert.match(source,/Cancel changes/);assert.match(source,/saving\.current \|\| !isDirty/);
 assert.match(source,/AbortSignal\.timeout\(20000\)/);
 assert.match(source,/fieldset disabled=\{isSaving\}/);
 for(const field of ['phone','emergencyNo','address','pan','aadhar','uan','bankName','accountNumber','ifscCode','branchName']) assert.match(source,new RegExp(`htmlFor="profile-${field}"`));
 assert.doesNotMatch(source,/localStorage|getItem\('auth_token'\)|\}, \[user\]\)/);
});
