export const PREF_KEY = 'suchii-prefs';

export const DEFAULT_PREFS = {
  theme: 'dark',
  density: 'comfortable',
  textSize: 'default',
  reduceMotion: false,
  showHelp: true,
  stripedRows: false,
  confirmSignOut: false,
  showStockAlerts: true,
  showTenderPortal: false,
  showTenderUpload: false,
  reportAttendance: true,
  reportProject: true,
  reportContractor: true,
  reportEmployee: true,
  reportLeave: true,
  reportCompactAmounts: true,
  reportSummary: true,
};

export function normalizePrefs(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    theme: src.theme === 'light' ? 'light' : 'dark',
    density: src.density === 'compact' ? 'compact' : 'comfortable',
    textSize: src.textSize === 'large' ? 'large' : 'default',
    reduceMotion: src.reduceMotion === true,
    showHelp: src.showHelp !== false,
    stripedRows: src.stripedRows === true,
    confirmSignOut: src.confirmSignOut === true,
    showStockAlerts: src.showStockAlerts !== false,
    showTenderPortal: src.showTenderPortal === true,
    showTenderUpload: src.showTenderUpload === true,
    reportAttendance: src.reportAttendance !== false,
    reportProject: src.reportProject !== false,
    reportContractor: src.reportContractor !== false,
    reportEmployee: src.reportEmployee !== false,
    reportLeave: src.reportLeave !== false,
    reportCompactAmounts: src.reportCompactAmounts !== false,
    reportSummary: src.reportSummary !== false,
  };
}

export function readPrefs() {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    return normalizePrefs(JSON.parse(window.localStorage.getItem(PREF_KEY) || 'null'));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function applyPrefs(prefs) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.density = prefs.density;
  root.dataset.text = prefs.textSize;
  root.dataset.motion = prefs.reduceMotion ? 'reduce' : 'full';
  root.dataset.rows = prefs.stripedRows ? 'striped' : 'plain';
  root.dataset.help = prefs.showHelp ? 'on' : 'off';
  root.dataset.alerts = prefs.showStockAlerts ? 'on' : 'off';
}

export const PREF_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem('${PREF_KEY}')||'null')||{};var d=document.documentElement;d.dataset.theme=p.theme==='light'?'light':'dark';d.dataset.density=p.density==='compact'?'compact':'comfortable';d.dataset.text=p.textSize==='large'?'large':'default';d.dataset.motion=p.reduceMotion?'reduce':'full';d.dataset.rows=p.stripedRows?'striped':'plain';d.dataset.help=p.showHelp===false?'off':'on';d.dataset.alerts=p.showStockAlerts===false?'off':'on';}catch(e){}})();`;
