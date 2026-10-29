// lib/AppContext.tsx — Unified Anti-Slop Theme and Language State Provider
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { getCustomRules, saveCustomRules } from './storage';
import { DEFAULT_RULES, I18N, type VerificationRules, type AppLanguage, type AppTheme } from './rules';
import { Theme } from './theme';

export type ThemeColors = typeof Theme.light & { isDark: boolean };

interface AppContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  theme: AppTheme;
  setTheme: (theme: AppTheme) => Promise<void>;
  colors: ThemeColors;
  isDark: boolean;
  t: (typeof I18N)['en'];
  rules: VerificationRules;
  updateRules: (newRules: VerificationRules) => Promise<void>;
}

const AppContext = createContext<AppContextValue>({
  language: 'en',
  setLanguage: async () => {},
  theme: 'light',
  setTheme: async () => {},
  colors: { ...Theme.light, isDark: false },
  isDark: false,
  t: I18N.en,
  rules: DEFAULT_RULES,
  updateRules: async () => {},
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [rules, setRules] = useState<VerificationRules>(DEFAULT_RULES);

  useEffect(() => {
    getCustomRules().then((saved) => {
      setRules(saved);
    });
  }, []);

  const language = rules.language || 'en';
  const theme = rules.theme || 'light';

  const isDark =
    theme === 'dark' ? true : theme === 'light' ? false : systemScheme === 'dark';

  const palette = isDark ? Theme.dark : Theme.light;
  const colors: ThemeColors = { ...palette, isDark };
  const t = I18N[language] || I18N.en;

  const setLanguage = useCallback(
    async (newLang: AppLanguage) => {
      const updated = { ...rules, language: newLang };
      setRules(updated);
      await saveCustomRules(updated);
    },
    [rules]
  );

  const setTheme = useCallback(
    async (newTheme: AppTheme) => {
      const updated = { ...rules, theme: newTheme };
      setRules(updated);
      await saveCustomRules(updated);
    },
    [rules]
  );

  const updateRules = useCallback(async (newRules: VerificationRules) => {
    setRules(newRules);
    await saveCustomRules(newRules);
  }, []);

  return (
    <AppContext.Provider
      value={{
        language,
        setLanguage,
        theme,
        setTheme,
        colors,
        isDark,
        t,
        rules,
        updateRules,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
