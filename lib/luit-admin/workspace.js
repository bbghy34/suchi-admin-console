import { prisma } from '@/lib/prisma';
import { invalidateReadCache, readCache } from '@/lib/read-cache';
import { CLIENT } from '@/config/client';
import { MODULES, enabledModules } from '@/config/modules';

/**
 * What the Luit admin controls at runtime for this client, stored in one
 * Setting row. Module states:
 *   on      - everyone with the right role sees it (default)
 *   preview - only the Luit admin sees it, for setup or a demo before launch
 *   off     - nobody sees it
 * The client's purchased modules (config/client.js) are the ceiling.
 */
const KEY = 'luit:workspace';
const TTL_MS = 15_000;
export const MODULE_STATES = ['on', 'preview', 'off'];
export const NOTICE_TONES = ['info', 'warning'];
const LOG_LIMIT = 50;

function blank() {
  return { modules: {}, notice: { active: false, text: '', tone: 'info' }, log: [] };
}

function parse(value) {
  try {
    const data = JSON.parse(value || '{}');
    const base = blank();
    return {
      modules: data.modules && typeof data.modules === 'object' ? data.modules : base.modules,
      notice: { ...base.notice, ...(data.notice || {}) },
      log: Array.isArray(data.log) ? data.log : base.log,
    };
  } catch {
    return blank();
  }
}

export function readWorkspace() {
  return readCache(KEY, TTL_MS, async () => {
    const row = await prisma.setting.findUnique({ where: { key: KEY } });
    return parse(row?.value);
  });
}

/** Module ids a viewer can use: purchased, not switched off, and with their required modules. */
export function modulesFor(workspace, { luitAdmin = false } = {}) {
  const purchased = enabledModules(CLIENT.modules);
  const wanted = MODULES.filter((module) => {
    if (!purchased.has(module.id)) return false;
    const state = workspace.modules[module.id] || 'on';
    return state === 'on' || (state === 'preview' && luitAdmin);
  }).map((module) => module.id);
  return [...enabledModules(wanted)];
}

export function moduleRows(workspace) {
  const purchased = enabledModules(CLIENT.modules);
  return MODULES.map((module) => ({
    ...module,
    purchased: purchased.has(module.id),
    state: module.core ? 'on' : workspace.modules[module.id] || 'on',
  }));
}

/** Apply a validated change from the Luit admin panel and record who made it. */
export async function updateWorkspace(change, actor) {
  const current = await readWorkspace();
  const next = { modules: { ...current.modules }, notice: { ...current.notice }, log: [...current.log] };
  const notes = [];
  for (const [id, state] of Object.entries(change.modules || {})) {
    const module = MODULES.find((entry) => entry.id === id);
    if (!module || module.core || !MODULE_STATES.includes(state)) throw new Error(`Unknown module setting: ${id}`);
    if ((next.modules[id] || 'on') !== state) notes.push(`${module.name}: ${state}`);
    next.modules[id] = state;
  }
  if (change.notice) {
    const text = String(change.notice.text ?? next.notice.text).slice(0, 280).trim();
    const tone = NOTICE_TONES.includes(change.notice.tone) ? change.notice.tone : next.notice.tone;
    const active = Boolean(change.notice.active ?? next.notice.active) && text.length > 0;
    if (text !== next.notice.text || tone !== next.notice.tone || active !== next.notice.active) {
      notes.push(active ? 'Workspace notice shown' : 'Workspace notice updated');
    }
    next.notice = { text, tone, active };
  }
  if (!notes.length) return current;
  next.log = [{ at: new Date().toISOString(), by: actor?.name || 'Luit admin', change: notes.join(' · ') }, ...next.log].slice(0, LOG_LIMIT);
  const value = JSON.stringify(next);
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  invalidateReadCache(KEY);
  return next;
}
