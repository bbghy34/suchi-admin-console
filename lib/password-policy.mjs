/**
 * One password rule for every place a password is set: the Settings change,
 * a new employee, and an administrator reset. Screens and API routes import
 * the same checks, so the form never accepts what the server refuses.
 */
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignores everything past 72 bytes, so a longer password would
// silently match any password that shares its first 72 bytes.
export const PASSWORD_MAX_BYTES = 72;

const byteLength = (value) => new TextEncoder().encode(value).length;

/** The reason a password cannot be used, or null when it is fine. */
export function passwordProblem(value) {
  if (typeof value !== 'string' || !value) return 'Enter a password.';
  if (value.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (byteLength(value) > PASSWORD_MAX_BYTES) return `Use at most ${PASSWORD_MAX_BYTES} characters.`;
  if (value.trim() !== value) return 'Remove the space at the start or end.';
  return null;
}

const CHECKS = [
  { label: `${PASSWORD_MIN_LENGTH}+ characters`, test: (v) => v.length >= PASSWORD_MIN_LENGTH },
  { label: 'Upper and lower case', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { label: 'A number', test: (v) => /\d/.test(v) },
  { label: 'A symbol', test: (v) => /[^A-Za-z0-9\s]/.test(v) },
];
const LABELS = ['Weak', 'Weak', 'Fair', 'Good', 'Strong'];

/** Advice only: the rule above decides what is accepted. */
export function passwordStrength(value = '') {
  const checks = CHECKS.map(({ label, test }) => ({ label, pass: test(value) }));
  const score = value ? checks.filter((c) => c.pass).length : 0;
  return { checks, score, max: CHECKS.length, label: value ? LABELS[score] : '' };
}
