import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform } from 'react-native';
import { useColorScheme } from 'nativewind';
import { storage } from '@autoparts/utils';

// ── Contexte de thème : source de vérité unique (préférence + schéma) ──
// • web   : les variantes dark: compilent en `.dark *` (stratégie par classe,
//           voir global.css) → bascule via la classe .dark sur <html>.
// • natif : Appearance.setColorScheme (RN 0.83+), « system » = null.
// Persisté via le driver de stockage de l'app (localStorage / SecureStore).
const KEY = 'app.themePreference';

export type ThemePreference = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

type AppThemeContextValue = {
  scheme: Scheme;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme: systemScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  const apply = useCallback((pref: ThemePreference) => {
    if (Platform.OS === 'web') {
      const dark =
        pref === 'dark' ||
        (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      return;
    }
    try {
      Appearance.setColorScheme(pref === 'system' ? null : pref);
    } catch {
      // Appareils sans override runtime — on suit le système.
    }
  }, []);

  // Charge la préférence stockée au premier montage.
  useEffect(() => {
    let cancelled = false;
    void storage
      .get<ThemePreference>(KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
          apply(stored);
        } else if (Platform.OS === 'web') {
          apply('system');
        }
      })
      .catch(() => {
        if (Platform.OS === 'web') apply('system');
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  // Web — suit le schéma système quand la préférence est « system ».
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (preference === 'system') apply('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference, apply]);

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      setPreferenceState(pref);
      apply(pref);
      void storage.set(KEY, pref).catch(() => {});
    },
    [apply],
  );

  const scheme: Scheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({ scheme, preference, setPreference }),
    [scheme, preference, setPreference],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const ctx = useContext(AppThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme() must be used within an <AppThemeProvider>.');
  }
  return ctx;
}
