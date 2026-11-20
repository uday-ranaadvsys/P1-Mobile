import { Stack } from 'expo-router';

/**
 * More is its own stack, so Masters and Settings screens open inside the tab: the top bar and the tab bar stay,
 * and each screen draws its own title and back link (ScreenTitle).
 */
export default function MoreLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
