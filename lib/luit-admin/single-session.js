import crypto from 'crypto';

/**
 * One Luit admin session at a time. Each sign-in stores a fresh session id
 * and puts it in the token as `ls`; a token whose id is not the stored one is
 * refused everywhere. The newest sign-in wins, so a forgotten or stolen
 * browser is shut out the next time the Luit admin signs in, and a crashed
 * browser never locks the account.
 */
const keyFor = (employeeId) => `luit:session:${employeeId}`;

export async function startLuitAdminSession(db, employeeId) {
  const sid = crypto.randomUUID();
  const key = keyFor(employeeId);
  await db.setting.upsert({ where: { key }, create: { key, value: sid }, update: { value: sid } });
  return sid;
}

export async function storedLuitAdminSession(db, employeeId) {
  const row = await db.setting.findUnique({ where: { key: keyFor(employeeId) } });
  return row?.value || null;
}

/** Sign-out ends the session only when it is still the current one. */
export async function endLuitAdminSession(db, employeeId, sid) {
  if (!employeeId || !sid) return;
  await db.setting.deleteMany({ where: { key: keyFor(employeeId), value: sid } });
}

export function sameSession(tokenSid, storedSid) {
  if (typeof tokenSid !== 'string' || typeof storedSid !== 'string' || tokenSid.length !== storedSid.length) return false;
  return crypto.timingSafeEqual(Buffer.from(tokenSid), Buffer.from(storedSid));
}
