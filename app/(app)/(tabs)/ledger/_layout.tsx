import { Stack } from 'expo-router';

/**
 * Accounts is its own stack, like Sales, Purchase and More: the Ledger, a party's statement and the payment screens open
 * inside the tab, so the top bar and the tab bar stay, and each screen draws its own title and back link (ScreenTitle).
 */
export default function LedgerLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
