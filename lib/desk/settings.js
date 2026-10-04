import { prisma } from '@/lib/prisma';
import { DEFAULT_WORK_CATEGORIES, SETTING_KEYS } from './constants';

export async function getSetting(key, fallback = null) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export async function getFirmName() {
  return getSetting(SETTING_KEYS.FIRM_NAME, 'Northeast Works');
}

export async function getWorkCategories() {
  const raw = await getSetting(SETTING_KEYS.WORK_CATEGORIES);
  if (!raw) return DEFAULT_WORK_CATEGORIES;
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.length ? list : DEFAULT_WORK_CATEGORIES;
  } catch {
    return DEFAULT_WORK_CATEGORIES;
  }
}
