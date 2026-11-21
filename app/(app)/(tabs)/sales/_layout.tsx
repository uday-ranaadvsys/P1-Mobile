import { Stack } from 'expo-router';

/**
 * Sales is its own stack, like More: its screens open inside the tab, so the top bar and the tab bar stay, and each
 * screen draws its own title and back link (ScreenTitle).
 */
export default function SalesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
