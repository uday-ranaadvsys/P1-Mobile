import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { radius, useColors, useThemed, type Colors } from '@/theme';

/** Filled buttons are the same dark red with white text in light and dark; `plain` is an outline. */
export function Button({ title, onPress, busy, disabled, tone = 'brand', style }: {
  title: string; onPress: () => void; busy?: boolean; disabled?: boolean; tone?: 'brand' | 'plain' | 'good'; style?: object;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const off = busy || disabled;
  const filled = tone !== 'plain';
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={[
        styles.button,
        tone === 'plain' ? styles.plain : { backgroundColor: tone === 'good' ? colors.receiveButton : colors.brand },
        off && { opacity: 0.6 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={filled ? '#fff' : colors.brandText} /> : (
        <Text style={[styles.text, !filled && { color: colors.brandText }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    button: { borderRadius: radius, paddingVertical: 14, alignItems: 'center' },
    plain: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.brandText },
    text: { color: '#fff', fontSize: 16, fontWeight: '600' },
  });
