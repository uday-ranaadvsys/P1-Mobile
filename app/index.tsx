import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { UNREACHABLE } from '@/api/client';
import { useSession } from '@/auth/session';
import { Button, Centered, ErrorText } from '@/components/ui';
import { colors } from '@/theme';

/** The address the app opens at. Always open: it waits for the sign-in check, then sends you where you belong. */
export default function Start() {
  const { status, user, reload } = useSession();

  if (status === 'out') return <Redirect href="/login" />;
  if (status === 'in') return <Redirect href={user?.mustChangePassword ? '/change-password' : '/today'} />;
  if (status === 'unreachable') {
    return (
      <Centered>
        <ErrorText message={UNREACHABLE} />
        <Button title="Try again" onPress={() => void reload()} />
      </Centered>
    );
  }
  return <Centered><ActivityIndicator size="large" color={colors.brand} /></Centered>;
}
