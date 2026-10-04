import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { directDocumentIdentity, officialPageUrl, officialFetch } from './direct-document.mjs';

const MAX_CHILDREN = 3;
const MAX_LINKS = 40;
const PAGE_BYTES = 2 * 1024 * 1024;
const STOP = new Set('tender tenders notice notices document documents download click here view details official government department https http www'.split(' '));
const words = value => [...new Set(String(value || '').toLowerCase().match(/[a-z0-9]{4,}/g) || [])].filter(w => !STOP.has(w));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const unsafeAction = /(?:logout|login|delete|remove|unsubscribe|javascript:|mailto:)/i;
function score(text, wanted) { const have = new Set(words(text)); return wanted.filter(w => have.has(w)).length; }
function boundedSection($, element) {
  const section=$(element).closest('tr,li,p,section,article');
  // An outer article can contain many unrelated tender cards. Never bundle it.
  if(section.find('section,article,tr,h1,h2,h3,h4').length>1)return $([]);
  return section;
}
function labelFor($, element) {
  const own = clean($(element).text() || $(element).attr('title') || $(element).attr('aria-label'));
  const context = boundedSection($,element).clone();
  context.find('*').append(' ');
  return clean(`${own} ${context.length ? context.text().slice(0,800) : ''}`).slice(0,1000);
}

/** One selected official page, then at most three relevant child notice pages.
 * No pagination, recursive crawling, form submission or JavaScript execution.
 */
export async function discoverOfficialDocuments(input, {
  title = '', detail = '', fetchImpl, lookupImpl, onEvent = () => {},
  deadlineAt = Date.now() + 45000, pause = ms => new Promise(r => setTimeout(r,ms)),
} = {}) {
  const root = officialPageUrl(input);
  const evidence = { strategy:'official-page-one-level-v1', sourceUrl:root || input, maxDepth:1, visited:[], skipped:[], limits:{childPages:MAX_CHILDREN,pageBytes:PAGE_BYTES,documents:MAX_LINKS} };
  if (!root) return { documents:[], evidence };
  const wanted = words(`${title} ${detail}`.slice(0,2000));
  const found = new Map(), children = new Map();
  let previousRequest = 0;
  async function inspect(url, depth, parentScore = 0) {
    if (Date.now() >= deadlineAt) { evidence.skipped.push({url,reason:'Discovery time limit reached'}); return; }
    const delay = Math.max(0,2000-(Date.now()-previousRequest));
    if (Date.now()+delay>=deadlineAt) { evidence.skipped.push({url,reason:'Discovery time limit reached'}); return; }
    if(delay)await pause(delay);
    previousRequest=Date.now();
    onEvent({message:depth?'Checking linked notice…':'Checking notice links…'});
    let page;
    try { page=await officialFetch(url,{accept:'text/html',cap:PAGE_BYTES,timeoutMs:15000,deadlineAt,fetchImpl,lookupImpl}); }
    catch(error){
      evidence.visited.push({url,depth,status:'failed',reason:error.message});
      if(error.code==='RATE_LIMITED' || error.status===429)throw error;
      return;
    }
    const visit={url,finalUrl:page.url,depth,status:'checked',bytes:page.bytes.length,sha256:createHash('sha256').update(page.bytes).digest('hex')};
    evidence.visited.push(visit);
    if(!/html|text\/plain/i.test(page.mime) && !/^\s*(?:<!doctype html|<html)/i.test(page.bytes.toString('utf8',0,100))) {
      evidence.skipped.push({url:page.url,reason:'Not a notice HTML page'});return;
    }
    const $=load(page.bytes.toString());$('script,style,nav,header,footer').remove();
    visit.title=clean($('title').text()).slice(0,300);
    visit.textExcerpt=clean($('body').text()).slice(0,8000);
    const groups = new Map();
    $('a[href],iframe[src],embed[src],object[data]').each((_,element)=>{
      let target;try{target=new URL($(element).attr('href')||$(element).attr('src')||$(element).attr('data'),page.url).href;}catch{return;}
      if(unsafeAction.test(target))return;
      const label=labelFor($,element), relevance=score(`${label} ${target}`,wanted);
      const file=directDocumentIdentity(target);
      if(file){
        const section=boundedSection($,element).get(0);
        if(section && !groups.has(section))groups.set(section,groups.size);
        const group=section?`${page.url}#section-${groups.get(section)}`:null;
        const anchorLabel=clean($(element).text() || $(element).attr('title'));
        const candidate={group,anchorLabel,link:file.link,label:label.slice(0,240)||file.link.split('/').pop(),score:relevance,parentScore,via:page.url,depth};
        const previous=found.get(file.link);
        if(!previous || candidate.score>previous.score)found.set(file.link,candidate);
        return;
      }
      const child=officialPageUrl(target);
      if(!child && /\.(?:pdf|docx?|xlsx?|zip)(?:[?#]|$)/i.test(target) && evidence.skipped.length<MAX_LINKS)evidence.skipped.push({url:target,reason:'File host is not in the official allowlist'});
      if(!child || child===root || depth>0 || new URL(child).hostname!==new URL(root).hostname)return;
      // Require tender-specific context and selected-result overlap; never follow global navigation.
      if(relevance<2 || !/tender|notice|bid|quotation|procurement|nit\b/i.test(`${label} ${target}`))return;
      if(!children.has(child))children.set(child,{url:child,score:relevance});
    });
  }
  await inspect(root,0);
  const ordered=[...children.values()].sort((a,b)=>b.score-a.score);
  for(const child of ordered.slice(0,MAX_CHILDREN))await inspect(child.url,1,child.score);
  for(const child of ordered.slice(MAX_CHILDREN,MAX_CHILDREN+MAX_LINKS))evidence.skipped.push({url:child.url,reason:'Child-page limit reached'});
  const documents=[...found.values()].sort((a,b)=>b.score-a.score||b.parentScore-a.parentScore);
  for(const doc of documents.slice(MAX_LINKS))evidence.skipped.push({url:doc.link,reason:'Document candidate limit reached'});
  evidence.documents=documents.slice(0,MAX_LINKS);
  evidence.completeness='bounded-discovery';
  return {documents:evidence.documents,evidence};
}
