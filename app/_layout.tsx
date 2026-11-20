import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from '@/auth/session';

const queryClient = new QueryClient();

/**
 * Which screens are open depends on the sign-in. `index` (the address the app opens at) is always
 * open: it waits for the sign-in check and then redirects (app/index.tsx).
 */
function Routes() {
  const { status, user } = useSession();
  const signedIn = status === 'in';
  const mustChange = signedIn && Boolean(user?.mustChangePassword);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={status === 'out'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={mustChange}>
        <Stack.Screen name="change-password" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !mustChange}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <StatusBar style="dark" />
        <Routes />
      </SessionProvider>
    </QueryClientProvider>
  );
}
