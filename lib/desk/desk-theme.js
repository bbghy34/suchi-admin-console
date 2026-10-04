export const DESK_THEME_KEY = 'desk-theme';

export const DESK_THEMES = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'paper', label: 'Paper' },
];

export function deskTheme() {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem(DESK_THEME_KEY);
  if (DESK_THEMES.some((item) => item.id === saved)) return saved;
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setDeskTheme(next) {
  const theme = DESK_THEMES.some((item) => item.id === next) ? next : 'dark';
  window.localStorage.setItem(DESK_THEME_KEY, theme);
  window.dispatchEvent(new CustomEvent('desk-theme', { detail: theme }));
  return theme;
}
