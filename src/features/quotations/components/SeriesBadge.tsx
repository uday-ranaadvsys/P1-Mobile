import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { OptionSheet } from '@/components/OptionSheet';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import type { SeriesOption } from '../api';

/**
 * The number the Quotation will get and its numbering series, at the right of the screen's title (the web puts them
 * beside the title too). Tap the series to change it; with none set up it says so.
 */
export function SeriesBadge({ options, loading, failed, value, onChange }: {
  options: SeriesOption[] | undefined; loading: boolean; failed: boolean; value: string | null; onChange: (seriesId: string) => void;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const chosen = options?.find((o) => o.id === value) ?? null;

  if (loading) return <ActivityIndicator color={colors.muted} />;

  if (failed || !options || options.length === 0) {
    const text = failed ? 'Could not load the numbering series.' : 'No numbering series set up. Ask your Admin to set one up.';
    return (
      <Pressable onPress={() => Alert.alert('Numbering series', text)} accessibilityRole="button" accessibilityLabel={text} style={styles.warn}>
        <Ionicons name="alert-circle" size={18} color={colors.warnText} />
        <Text style={[styles.warnText, { color: colors.warnText }]}>No series</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.number} numberOfLines={1} accessibilityLabel={`Quotation number ${chosen?.nextNumber ?? 'not set'}`}>{chosen?.nextNumber ?? '—'}</Text>
      <Pressable
        onPress={() => options.length > 1 && setOpen(true)}
        disabled={options.length <= 1}
        accessibilityRole="button"
        accessibilityLabel={`Series: ${chosen?.name ?? 'not chosen'}`}
        style={styles.series}
      >
        <Text style={styles.seriesText} numberOfLines={1}>{chosen?.name ?? 'Series'}</Text>
        {options.length > 1 ? <Ionicons name="chevron-down" size={14} color={colors.muted} /> : null}
      </Pressable>
      <OptionSheet
        visible={open}
        title="Series"
        options={options.map((o) => ({ value: o.id, label: `${o.name}${o.isDefault ? ' (Default)' : ''}` }))}
        value={value ?? ''}
        onSelect={onChange}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: { alignItems: 'flex-end', maxWidth: 190 },
    number: { ...type.headline, color: c.ink },
    series: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
    seriesText: { ...type.footnote, color: c.muted, flexShrink: 1 },
    warn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
    warnText: { ...type.subhead, fontWeight: '600' },
  });
