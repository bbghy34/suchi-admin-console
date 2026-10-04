import { extractOfficialDocument } from './extract.mjs';
import { PublicNoticeError, allowedPublicDocument } from './public-notice.mjs';
import { createHash } from 'node:crypto';
import { directDocumentIdentity, officialFetch, sniffDocument, parseDirectNotice } from './direct-document.mjs';

/** Only sibling files in the same matched notice section are eligible. */
export async function collectLinkedFiles(packet, candidates = [], {
  fetchImpl, lookupImpl, deadlineAt=Date.now()+90000, onEvent=()=>{},
  pause=ms=>new Promise(r=>setTimeout(r,ms)),
}={}) {
  const maxBytes=50*1024*1024, perFile=20*1024*1024;
  let requests=0;
  let bytes=packet.documents.reduce((n,d)=>n+d.bytes.length,0);
  const hashes=new Set(packet.documents.map(d=>d.sha256));
  const seen=new Set(packet.documents.map(d=>d.sourceUrl));
  packet.evidence.downloads ||= [];
  for(const [index,candidate] of candidates.slice(0,7).entries()) {
    const identity=directDocumentIdentity(candidate.link) || (allowedPublicDocument(candidate.link,'gem') ? {link:candidate.link} : null);
    if(!identity){packet.evidence.downloads.push({url:candidate.link,status:'not-downloaded',reason:'Unsupported official attachment endpoint'});continue;}
    if(seen.has(identity.link))continue;
    seen.add(identity.link);
    const missing=reason=>packet.evidence.downloads.push({url:identity.link,status:'not-downloaded',reason});
    if(Date.now()+2000>=deadlineAt || bytes>=maxBytes){missing('Packet time or size limit reached');continue;}
    await pause(2000);
    onEvent({message:`Downloading attachment ${index+1}/${Math.min(candidates.length,7)}…`});
    try {
      const file=await officialFetch(identity.link,{fetchImpl,lookupImpl,deadlineAt,cap:Math.min(perFile,maxBytes-bytes),accept:'application/octet-stream,*/*',timeoutMs:30000});
      requests+=file.requests || 1;
      bytes+=file.bytes.length;
      const kind=sniffDocument(file.bytes,new URL(file.url).pathname);
      if(!kind){missing('Website returned an unsupported file or HTML page');continue;}
      const sha256=createHash('sha256').update(file.bytes).digest('hex');
      if(hashes.has(sha256)){packet.evidence.downloads.push({url:identity.link,finalUrl:file.url,status:'downloaded',duplicateOf:sha256});continue;}
      hashes.add(sha256);
      const base=new URL(file.url).pathname.split('/').pop().replace(/\.[^.]+$/,'').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,70)||'attachment';
      const name=`linked-${index+1}-${base}.${kind}`;
      const doc={name,type:/boq|schedule.*quantit/i.test(candidate.anchorLabel||'')?'BOQ':/corrigendum|addendum/i.test(candidate.anchorLabel||'')?'CORRIGENDUM':'OTHER',bytes:file.bytes,sha256,sourceUrl:file.url};
      packet.documents.push(doc);const{bytes:content,...manifest}=doc;packet.manifest.push(manifest);
      packet.evidence.downloads.push({url:identity.link,finalUrl:file.url,status:'downloaded',bytes:content.length,sha256});
    }catch(error){
      missing(error.message);
      if(error.code==='RATE_LIMITED'||error.status===429){
        for(const remaining of candidates.slice(index+1,7))packet.evidence.downloads.push({url:remaining.link,status:'not-downloaded',reason:'Stopped after official portal cooldown'});
        break;
      }
    }
  }
  for(const candidate of candidates.slice(7))packet.evidence.downloads.push({url:candidate.link,status:'not-downloaded',reason:'Eight-file packet limit reached'});
  packet.captureScope='Selected official file and up to seven supporting files in the same matched notice section. Discovery follows at most one child-page level.';
  packet.evidence.completeness=packet.evidence.downloads.some(d=>d.status!=='downloaded')?'partial':'matched-notice-section';
  packet.metrics={...packet.metrics,requests:(packet.metrics?.requests||0)+requests,bytes};
  return packet;
}


/** A short NIT may only be a cover memo; validate against the matching full document. */
export async function validateLinkedPacket(packet, row={}, {extract=extractOfficialDocument,onEvent=()=>{}}={}) {
  if (!packet.evidence.parseResult?.missing?.length) return packet;
  onEvent({message:'Reading document details…'});
  const attempts=[];
  for(const document of packet.documents.slice(1)) {
    if(!/\.pdf$/i.test(document.name))continue;
    try {
      const extracted=await extract(document.bytes,'application/pdf',document.name);
      const parsed=parseDirectNotice(extracted.text || '',{rowTitle:row.title,host:packet.portal.label,expectedReference:row.reference,expectedTenderId:row.portalTenderId});
      attempts.push({sourceUrl:document.sourceUrl,missing:parsed.missing});
      if(parsed.missing.length)continue;
      packet.fields={...parsed.fields,'Tender ID':packet.fields['Tender ID']};
      packet.portal.state=parsed.state;
      packet.evidence.validatedFrom=document.sourceUrl;
      packet.evidence.parseResult=parsed;
      packet.evidence.closingDateEvidence=parsed.closing?.evidence;
      packet.evidence.closingTimeStated=parsed.closing?.timeStated;
      packet.evidence.validationAttempts=attempts;
      return packet;
    }catch(error){attempts.push({sourceUrl:document.sourceUrl,error:error.message});}
  }
  throw new PublicNoticeError('Files were retrieved, but a matching tender title and closing date/time could not be verified. Use manual intake.','MANUAL_INTAKE_REQUIRED',{evidence:{...packet.evidence,validationAttempts:attempts}});
}
