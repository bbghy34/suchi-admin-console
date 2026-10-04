import { savedDownloadKey } from './saved-download.mjs';

/** One batch lookup; never download or scan file bytes while displaying results. */
export async function attachSavedTenders(db, rows) {
  const keys = rows.map(row => savedDownloadKey({row}));
  const unique = [...new Map(keys.filter(Boolean).map(key => [JSON.stringify(key),key])).values()];
  if (!unique.length) return rows;
  const saved = await db.tender.findMany({where:{OR:unique},select:{id:true,sourceId:true,sourceUrl:true,portalTenderId:true}});
  const byId = new Map(saved.filter(t=>t.portalTenderId).map(t=>[`${t.sourceId}:${t.portalTenderId}`,t.id]));
  const byUrl = new Map(saved.filter(t=>t.sourceUrl).map(t=>[`${t.sourceId}:${t.sourceUrl}`,t.id]));
  return rows.map((row,index)=>{
    const key=keys[index];
    const id=key && (key.portalTenderId ? byId.get(`${key.sourceId}:${key.portalTenderId}`) : byUrl.get(`${key.sourceId}:${key.sourceUrl}`));
    return id ? {...row,existingTenderId:id} : row;
  });
}
