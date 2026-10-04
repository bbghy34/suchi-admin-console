import test from 'node:test';
import assert from 'node:assert/strict';
import {describeImportStage,recordImportStage,importStageItems} from '../lib/desk/portal-import/stages.mjs';
test('stages follow real messages and only explicit CAPTCHA attempt numbers',()=>{
 assert.equal(describeImportStage('Finding the official notice and checking saved tenders…').stage,'find');
 let prior=describeImportStage('Solving government CAPTCHA with 2Captcha · challenge 2. No typing needed…');
 assert.deepEqual(prior,{stage:'captcha',captchaAttempt:2});
 assert.deepEqual(describeImportStage('The portal rejected that CAPTCHA answer. Requesting another solve automatically…',prior),prior);
 assert.equal(describeImportStage('Downloading official file 7',prior).captchaAttempt,2);
 assert.equal(describeImportStage('Extracting document text').stage,'save');
 assert.equal(describeImportStage('Saving official files').stage,'save');
 assert.equal(describeImportStage('CAPTCHA submitted').captchaAttempt,null);
});
test('heartbeats add no stage history; distinct progress is bounded',()=>{
 let job={progressMessage:'Finding notice'};
 job={...job,...recordImportStage(job,{message:'Finding notice',stage:'find'},'now')};
 assert.deepEqual(recordImportStage(job,undefined,'later'),{});
 assert.equal(recordImportStage(job,{message:'Finding notice',stage:'find'},'later').stageHistory.length,1);
 for(let n=0;n<40;n++)job={...job,...recordImportStage(job,{message:'Phase '+n,stage:n%2?'download':'captcha'},'now')};
 assert.equal(job.stageHistory.length,24);
});
test('optional CAPTCHA is never shown as done if it did not run',()=>{
 const done=importStageItems({status:'SUCCEEDED',stage:'save',stageHistory:[{stage:'find'},{stage:'download'},{stage:'save'}]});
 assert.equal(done.find(x=>x.stage==='captcha').state,'skipped');
 const running=importStageItems({status:'RUNNING',stage:'find'});
 assert.equal(running.find(x=>x.stage==='captcha').state,'pending');
 const failed=importStageItems({status:'FAILED',stage:'captcha',captchaAttempt:3});
 assert.equal(failed.find(x=>x.stage==='captcha').state,'stopped');assert.equal(failed.find(x=>x.stage==='download').state,'pending');
});

test('review-needed files have completed actual download/save stages',()=>{
 const items=importStageItems({status:'NEEDS_REVIEW',stage:'save',stageHistory:[{stage:'find'},{stage:'download'},{stage:'save'}]});
 assert.equal(items.find(x=>x.stage==='save').state,'done');
 assert.equal(items.find(x=>x.stage==='download').state,'done');
 assert.equal(items.find(x=>x.stage==='captcha').state,'skipped');
});

test('review artifact links stay on the authenticated download endpoint',async()=>{
 const {reviewJobArtifacts,importJobsCompletedSince}=await import('../lib/desk/portal-import/jobs-client.mjs');
 const file={id:'safe',name:'file.pdf',downloadUrl:'/api/desk/portal-import/artifacts/safe'};
 assert.deepEqual(reviewJobArtifacts({artifacts:[file,{...file,downloadUrl:'https://external.invalid/file'},{...file,downloadUrl:'javascript:alert(1)'}]}),[file]);
 const done=importJobsCompletedSince(new Map([['job','RUNNING']]),[{id:'job',status:'NEEDS_REVIEW'}]);
 assert.equal(done,true);
});
