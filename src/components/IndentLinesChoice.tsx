import { Ionicons } from '@expo/vector-icons';
import { INDENT_LINES_ON_CANCEL, type IndentLinesOnCancel } from 'floman-shared/constants';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

// The words are the web's (client components/IndentLinesChoice.tsx); copied until the web moves them into shared/.
const OPTIONS: { value: IndentLinesOnCancel; label: string; hint: string }[] = [
  { value: INDENT_LINES_ON_CANCEL.RELEASE, label: 'Give them back to Manage Indents', hint: 'They can be ordered again (e.g. from another vendor).' },
  { value: INDENT_LINES_ON_CANCEL.CANCEL, label: 'Cancel them', hint: 'The indenter sees the reason and raises a new indent if still needed.' },
];

/** In the Cancel box of a Purchase Order (or Purchase): what happens to the items that came from indents. */
export function IndentLinesChoice({ value, onChange, disabled }: { value: IndentLinesOnCancel; onChange: (value: IndentLinesOnCancel) => void; disabled?: boolean }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.legend}>Items that came from indents</Text>
      {OPTIONS.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.row, on && { borderColor: colors.brandText }, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.brandText : colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{o.label}</Text>
              <Text style={styles.hint}>{o.hint}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    legend: { ...type.subhead, fontWeight: '700', color: c.ink },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: 56, padding: spacing.sm, borderRadius: 12, borderWidth: 1, borderColor: c.outline },
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    hint: { ...type.footnote, color: c.muted },
  });
