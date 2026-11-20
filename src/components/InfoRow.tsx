import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { type, useColors, useThemed, type Colors } from '@/theme';

/** A label over its value; an empty value shows a dash. A value with `onPress` is a link (call, email). */
export function InfoRow({ label, value, onPress }: { label: string; value: string | null | undefined; onPress?: () => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.label}>{label}</Text>
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="link" style={{ minHeight: 24 }}>
          <Text style={[styles.value, { color: colors.brandText }]}>{value}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.value, !value && { color: colors.faint }]}>{value || '—'}</Text>
      )}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    label: { ...type.footnote, color: c.muted },
    value: { ...type.body, color: c.ink },
  });
