import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/features/auth/session';

/** Signed out: login and choose company. Already signed in (or just did): on to the app. */
export default function AuthLayout() {
  const { status } = useSession();
  if (status === 'in') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
