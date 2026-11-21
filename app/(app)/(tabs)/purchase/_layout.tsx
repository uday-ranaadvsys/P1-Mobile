import { Stack } from 'expo-router';

/**
 * Purchase is its own stack, like Sales and More: its screens open inside the tab, so the top bar and the tab bar stay,
 * and each screen draws its own title and back link (ScreenTitle).
 */
export default function PurchaseLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
