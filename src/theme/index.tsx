// Extracted from src/styles.css (oklch tokens converted to hex equivalents).
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as RNuseColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark';

const palettes = {
  light: {
    background: '#ffffff',
    foreground: '#1a1a1a',
    card: '#ffffff',
    cardForeground: '#1a1a1a',
    primary: '#2a6dff',
    primaryForeground: '#ffffff',
    secondary: '#f3f3f4',
    secondaryForeground: '#1a1a1a',
    muted: '#f3f3f4',
    mutedForeground: '#737378',
    accent: '#f3f3f4',
    destructive: '#dc2a2a',
    destructiveForeground: '#ffffff',
    success: '#16a34a',
    border: '#e7e7e8',
    borderStrong: '#cfcfd1',
    input: '#e7e7e8',
    ring: '#2a6dff',
  },
  dark: {
    background: '#101117',
    foreground: '#f7f7f8',
    card: '#181922',
    cardForeground: '#f7f7f8',
    primary: '#4d8aff',
    primaryForeground: '#ffffff',
    secondary: '#22232d',
    secondaryForeground: '#f7f7f8',
    muted: '#22232d',
    mutedForeground: '#9a9ba6',
    accent: '#22232d',
    destructive: '#ef4444',
    destructiveForeground: '#f7f7f8',
    success: '#22c55e',
    border: '#2a2b36',
    borderStrong: '#393a47',
    input: '#262732',
    ring: '#4d8aff',
  },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 9999 };
export const font = {
  sans: 'Manrope_500Medium',
  sansSemi: 'Manrope_600SemiBold',
  sansBold: 'Manrope_700Bold',
  display: 'Sora_600SemiBold',
  displayBold: 'Sora_700Bold',
};

export type ColorScheme = typeof palettes.light;

type ThemeContextType = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  theme: ColorScheme;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = RNuseColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem('audibles.theme').then((val) => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        setThemeModeState(val);
      }
    });
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await AsyncStorage.setItem('audibles.theme', mode);
  };

  const resolvedScheme = themeMode === 'system' ? systemScheme : themeMode;
  const isDark = resolvedScheme === 'dark';
  const theme = isDark ? palettes.dark : palettes.light;

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, theme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
}

export function useTheme(): ColorScheme {
  const context = useContext(ThemeContext);
  if (!context) {
    const systemScheme = RNuseColorScheme();
    return systemScheme === 'dark' ? palettes.dark : palettes.light;
  }
  return context.theme;
}

export { palettes };
