import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { SessionProvider, useSession } from '@/features/auth/session';
import { queryClient } from '@/lib/queryClient';
import { PrivacyProvider } from '@/lib/privacy';
import { applySavedTheme, useColors, useIsDark } from '@/theme';

// The splash screen stays up while the saved sign-in is checked (the navigator is never swapped for a spinner).
void SplashScreen.preventAutoHideAsync();

/** The phone's light or dark setting (or the sun button's), for the app and for the navigation. */
function Themed({ children }: { children: ReactNode }) {
  const dark = useIsDark();
  const colors = useColors();
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: colors.background, card: colors.surface, text: colors.ink, border: colors.outline, primary: colors.brandText },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="auto" />
      {children}
    </ThemeProvider>
  );
}

/** Two areas: (auth) signed out, (app) signed in. Each one's layout sends you to the other when it should. */
function Routes() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

export default function RootLayout() {
  // The light/dark choice made with the sun button, from last time.
  useEffect(() => {
    void applySavedTheme();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <PrivacyProvider>
          <Themed>
            <Routes />
          </Themed>
        </PrivacyProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
