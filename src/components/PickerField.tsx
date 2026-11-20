import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { OptionSheet, type SheetOption } from '@/components/OptionSheet';
import { radius, spacing, type, useColors, useThemed, type Colors } from '@/theme';

export type PickerOption = SheetOption;

/** A choice from a list (a state, a place), shown as a field that opens a sheet. */
export function PickerField({ label, value, options, onChange, placeholder = 'Choose…', required, error, disabled, searchable }: {
  label: string; value: string; options: PickerOption[]; onChange: (value: string) => void; placeholder?: string;
  required?: boolean; error?: string | null; disabled?: boolean; searchable?: boolean;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const [open, setOpen] = useState(false);
  // A saved value that is not in the list is still shown (the web keeps one saved before the list existed).
  const all = useMemo(() => (value && !options.some((o) => o.value === value) ? [{ value, label: value }, ...options] : options), [options, value]);
  const current = all.find((o) => o.value === value);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? 'not chosen'}`}
        style={({ pressed }) => [styles.box, error ? { borderColor: colors.danger } : null, disabled && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
      >
        <Text style={[styles.value, !current && { color: colors.placeholder }]} numberOfLines={1}>{current?.label ?? placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <OptionSheet visible={open} title={label} options={all} value={value} onSelect={onChange} onClose={() => setOpen(false)} searchable={searchable} />
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    box: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 48,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, borderRadius: radius, paddingHorizontal: spacing.md,
    },
    value: { ...type.body, flex: 1, color: c.ink },
    error: { ...type.footnote },
  });
