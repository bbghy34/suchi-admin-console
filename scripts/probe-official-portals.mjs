/** Read-only, bounded portal discovery. No CAPTCHA tasks or document downloads. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { load } from 'cheerio';
import { PORTALS } from '../lib/desk/portal-import/identity.mjs';
import { AssamPortal, parseDetails } from '../lib/desk/portal-import/assam.mjs';
const selected = process.argv.slice(2);
const portals = PORTALS.filter(p => !selected.length || selected.includes(p.id));
if (!portals.length) throw new Error('No registered portal selected');
const directory = 'tools/assam-tenders/verification/multi-portal';
mkdirSync(directory, { recursive: true });
const results=[];
for (const portal of portals) {
 const result={id:portal.id,base:portal.base,checkedAt:new Date().toISOString()};
 const client=new AssamPortal({portal,deadlineMs:45000});
 try {
  const html=await client.page(portal.base); const $=load(html);
  result.title=$('title').text().trim();
  result.detailLinks=$('a[href]').toArray().map(a=>({title:$(a).text().trim(),url:new URL($(a).attr('href'),portal.base).href})).filter(a=>/[?&]service=direct/.test(a.url)&&/[?&]page=Home/.test(a.url)&&/[?&]sp=/.test(a.url)).slice(0,4);
  if(result.detailLinks.length) {
   const detail=await client.page(result.detailLinks[0].url);const parsed=parseDetails(detail);
   result.sample={link:result.detailLinks[0].url,fields:parsed.fields,manifest:parsed.manifest};
  }
  result.status='reachable';
 } catch(error) {result.status='failed';result.error=error.message;result.cause=error.cause?.code;}
 result.requests=client.metrics.requests;results.push(result);
 writeFileSync(`${directory}/${portal.id}-probe.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify({id:result.id,status:result.status,title:result.title,tenderId:result.sample?.fields['Tender ID'],files:result.sample?.manifest.length,links:result.detailLinks?.length,error:result.error,cause:result.cause}));
}
