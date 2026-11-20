import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { type, useColors, useThemed, type Colors } from '@/theme';

/**
 * The web's buttons (client/src/index.css), on the phone:
 * - primary (.btn-primary): the main action, filled brand red, bold white text;
 * - secondary (.btn-secondary): any normal action, transparent with a grey outline and dark text;
 * - receive (.btn-receive): money coming in, filled green, same shape as primary.
 * Danger is an outline in the danger colour, never filled (.btn-danger).
 */
export type ButtonTone = 'primary' | 'secondary' | 'receive' | 'danger';

export function Button({ title, onPress, busy, disabled, tone = 'primary', style }: {
  title: string; onPress: () => void; busy?: boolean; disabled?: boolean; tone?: ButtonTone; style?: object;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const off = busy || disabled;
  const filled = tone === 'primary' || tone === 'receive';
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(busy) }}
      style={({ pressed }) => [
        styles.button,
        tone === 'primary' && { backgroundColor: colors.brand },
        tone === 'receive' && { backgroundColor: colors.receiveButton },
        tone === 'secondary' && styles.secondary,
        tone === 'danger' && { borderWidth: 1, borderColor: colors.danger },
        pressed && { opacity: 0.75 },
        off && { opacity: 0.5 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={filled ? '#FFFFFF' : colors.ink} />
      ) : (
        <Text style={[filled ? styles.filledText : styles.outlineText, tone === 'danger' && { color: colors.danger }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    // 48 pt tall (the minimum is 44), rounded like the web's buttons.
    button: { minHeight: 48, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
    secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.outline },
    filledText: { ...type.headline, fontWeight: '700', color: '#FFFFFF' },
    outlineText: { ...type.headline, color: c.ink },
  });
