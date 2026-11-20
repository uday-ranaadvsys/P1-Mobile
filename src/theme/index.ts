import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { Appearance, useColorScheme } from 'react-native';

// Colours from the web app (client/src/index.css), light and dark. The app follows the phone's setting.
export type Colors = {
  background: string;
  surface: string;
  ink: string;
  muted: string;
  faint: string;
  outline: string;
  divider: string;
  track: string;
  /** Filled buttons. */
  brand: string;
  /** Brand colour for text and borders (lighter on dark, as on the web). */
  brandText: string;
  brandTint: string;
  danger: string;
  receive: string;
  /** Filled green button (Approve). */
  receiveButton: string;
  lateText: string;
  lateBg: string;
  waitText: string;
  waitBg: string;
  placeholder: string;
};

const light: Colors = {
  background: '#F3F4F6',
  surface: '#FFFFFF',
  ink: '#1F2937',
  muted: '#6B7280',
  faint: '#6B7280',
  outline: '#D1D5DB',
  divider: '#E5E7EB',
  track: '#F3F4F6',
  brand: '#8A171A',
  brandText: '#8A171A',
  brandTint: 'rgba(138,23,26,0.06)',
  danger: '#DC2626',
  receive: '#059669',
  receiveButton: '#059669',
  lateText: '#B91C1C',
  lateBg: 'rgba(220,38,38,0.10)',
  waitText: '#1D4ED8',
  waitBg: 'rgba(59,130,246,0.12)',
  placeholder: '#6B7280',
};

const dark: Colors = {
  background: '#0F0F0F',
  surface: '#1C1C1C',
  ink: '#E5E5E5',
  muted: '#9CA3AF',
  faint: '#8A8F98',
  outline: '#333333',
  divider: '#2A2A2A',
  track: '#2A2A2A',
  brand: '#8A171A',
  brandText: '#FF8083',
  brandTint: 'rgba(138,23,26,0.20)',
  danger: '#F87171',
  receive: '#34D399',
  receiveButton: '#059669',
  lateText: '#FF8083',
  lateBg: 'rgba(248,113,113,0.16)',
  waitText: '#60A5FA',
  waitBg: 'rgba(59,130,246,0.18)',
  placeholder: '#8A8F98',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24 } as const;

/**
 * The type scale, after Apple's text styles (typography.md: body 17, minimum 11): one size, weight and line
 * height per role, so hierarchy comes from the role and not from one-off numbers.
 */
export const type = {
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  footnoteBold: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
} as const;
export const radius = 10;

export function useIsDark() {
  return useColorScheme() === 'dark';
}

export function useColors(): Colors {
  return useIsDark() ? dark : light;
}

/** Styles that depend on the colours: `const styles = useThemed(makeStyles)`. */
export function useThemed<T>(factory: (colors: Colors) => T): T {
  const colors = useColors();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(colors), [colors]);
}

const THEME_KEY = 'floman.theme';

/** The light/dark choice made with the sun button, kept on the phone; none = follow the phone's setting. */
export async function applySavedTheme() {
  const saved = await AsyncStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') Appearance.setColorScheme(saved);
}

/** Switches light <-> dark (the sun button) and remembers it. */
export function toggleTheme() {
  const next = Appearance.getColorScheme() === 'dark' ? 'light' : 'dark';
  Appearance.setColorScheme(next);
  void AsyncStorage.setItem(THEME_KEY, next);
}
