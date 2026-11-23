import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { FieldLink } from '@/components/FieldLink';
import { formatDate } from '@/lib/format';
import { radius, spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** A day as the server wants it (YYYY-MM-DD), from a Date, in this phone's own day. */
export const toISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** A date field: shows 06 Oct 2026, and opens the phone's own date picker. The value is YYYY-MM-DD or empty. */
export function DateField({ label, value, onChange, onClear, required, error }: {
  label: string; value: string; onChange: (iso: string) => void; onClear?: () => void; required?: boolean; error?: string | null;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const date = value ? new Date(`${value}T00:00:00`) : new Date();

  const open = () => {
    if (Platform.OS !== 'android') return;
    DateTimePickerAndroid.open({ value: date, mode: 'date', onChange: (_, picked) => picked && onChange(toISODate(picked)) });
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}
          {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
        </Text>
        {/* At the top right of the field, level with its label (as "Edit customer"). */}
        {value && onClear ? <FieldLink label="Clear" onPress={onClear} /> : null}
      </View>
      {Platform.OS === 'ios' ? (
        <View style={[styles.box, error ? { borderColor: colors.danger } : null]}>
          <DateTimePicker value={date} mode="date" display="compact" onChange={(_, picked) => picked && onChange(toISODate(picked))} />
        </View>
      ) : (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ? formatDate(value) : 'not chosen'}`}
          style={({ pressed }) => [styles.box, error ? { borderColor: colors.danger } : null, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.value, !value && { color: colors.placeholder }]}>{value ? formatDate(value) : 'Choose a date'}</Text>
        </Pressable>
      )}
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    box: { minHeight: 48, justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, borderRadius: radius, paddingHorizontal: spacing.md },
    value: { ...type.body, color: c.ink },
    error: { ...type.footnote },
    labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  });
