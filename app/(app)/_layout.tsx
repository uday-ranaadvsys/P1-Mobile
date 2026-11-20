import { Redirect, Stack, useSegments } from 'expo-router';
import { UNREACHABLE } from '@/api/client';
import { Button } from '@/components/Button';
import { Centered } from '@/components/Screen';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { useColors } from '@/theme';

/**
 * Everything for a signed-in user. Signed out: login. A temporary password from an admin: nothing
 * else opens until it is replaced. The splash screen covers the sign-in check (app/_layout.tsx).
 */
export default function AppLayout() {
  const { status, user, reload } = useSession();
  const colors = useColors();
  const segments = useSegments();
  const onChangePassword = (segments as string[])[1] === 'change-password';

  if (status === 'loading') return null;
  if (status === 'unreachable') {
    return (
      <Centered>
        <ErrorText message={UNREACHABLE} />
        <Button title="Try again" tone="secondary" onPress={() => void reload()} />
      </Centered>
    );
  }
  if (status === 'out') return <Redirect href="/login" />;

  const mustChange = Boolean(user?.mustChangePassword);
  if (mustChange && !onChangePassword) return <Redirect href="/change-password" />;
  if (!mustChange && onChangePassword) return <Redirect href="/" />;

  const header = {
    headerShown: true,
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.ink,
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal',
  } as const;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="change-password" />
      <Stack.Screen name="search" />
      <Stack.Screen name="approvals/[group]" options={header} />
      <Stack.Screen name="document/[kind]/[id]" options={header} />
    </Stack>
  );
}
