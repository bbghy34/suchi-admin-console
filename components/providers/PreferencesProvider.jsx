'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { applyPrefs, DEFAULT_PREFS, normalizePrefs, PREF_KEY, readPrefs } from '@/lib/preferences';

const PreferencesContext = createContext({
  prefs: DEFAULT_PREFS,
  setPref: () => {},
  resetPrefs: () => {},
});

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  useEffect(() => {
    const stored = readPrefs();
    setPrefs(stored);
    applyPrefs(stored);
  }, []);

  const setPref = useCallback((key, value) => {
    setPrefs((current) => {
      const next = normalizePrefs({ ...current, [key]: value });
      window.localStorage.setItem(PREF_KEY, JSON.stringify(next));
      applyPrefs(next);
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    window.localStorage.removeItem(PREF_KEY);
    setPrefs(DEFAULT_PREFS);
    applyPrefs(DEFAULT_PREFS);
  }, []);

  return (
    <PreferencesContext.Provider value={{ prefs, setPref, resetPrefs }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}

export default PreferencesProvider;
