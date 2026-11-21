import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { ComingSoon } from '@/components/ComingSoon';
import { ScreenTitle } from '@/components/ScreenTitle';
import { spacing } from '@/theme';

/** A Purchase row whose screen is not built yet opens here, with its name. */
export default function Soon() {
  const { title } = useLocalSearchParams<{ title?: string }>();
  return (
    <View style={{ flex: 1, padding: spacing.md }}>
      <ScreenTitle back="Purchase" />
      <ComingSoon title={title ?? ''} />
    </View>
  );
}
