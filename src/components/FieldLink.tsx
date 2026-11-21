import { Pressable } from 'react-native';
import { Text } from '@/components/AppText';
import { linkIndigo, type } from '@/theme';

/** A small action at the top right of a field, level with its label ("Edit customer", "Edit part"), in indigo as on the web. */
export function FieldLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={{ top: 14, bottom: 14, left: 12, right: 4 }} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      <Text style={[type.subhead, { fontWeight: '700', color: linkIndigo }]}>{label}</Text>
    </Pressable>
  );
}
