import { CLIENT } from '@/config/client';

/** Kinds of construction work a project can be. A client can set its own in config/client.js (`projectTypes`). */
export const DEFAULT_PROJECT_TYPES = [
  'Civil Engineering',
  'Roads & Bridges',
  'Buildings',
  'Water Supply & Sanitation',
  'Electrical',
  'Irrigation & Flood Control',
  'Other',
];

export const PROJECT_TYPES = CLIENT.projectTypes?.length ? CLIENT.projectTypes : DEFAULT_PROJECT_TYPES;

/**
 * The type list plus any type already saved on projects, so an older value
 * stays visible in filters and is never dropped when a project is edited.
 */
export function projectTypeOptions(...saved) {
  const extra = saved.flat().filter((type) => type && !PROJECT_TYPES.includes(type));
  return [...PROJECT_TYPES, ...new Set(extra)];
}
