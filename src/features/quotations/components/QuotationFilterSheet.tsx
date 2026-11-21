import { AMOUNT_RANGES, LIST_FILTER, LIST_SORT } from 'floman-shared/constants';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Text } from '@/components/AppText';
import { DateField } from '@/components/DateField';
import { PickerField } from '@/components/PickerField';
import { spacing, type, useThemed, type Colors } from '@/theme';

export type QuotationFilterState = { amount: string; from: string; to: string; sort: string };

export const DEFAULT_QUOTATION_FILTERS: QuotationFilterState = { amount: LIST_FILTER.ALL, from: '', to: '', sort: LIST_SORT.NEWEST };

// The choices and their words are the web's (client features/quotations/pages/Quotations.tsx).
export const AMOUNT_OPTIONS = [
  { value: LIST_FILTER.ALL, label: 'Any' },
  ...Object.entries(AMOUNT_RANGES).map(([value, range]) => ({ value, label: range.label })),
];
export const SORT_OPTIONS = [
  { value: LIST_SORT.NEWEST, label: 'Newest' },
  { value: LIST_SORT.OLDEST, label: 'Oldest' },
  { value: LIST_SORT.AMOUNT_HIGH, label: 'Amount, high to low' },
  { value: LIST_SORT.AMOUNT_LOW, label: 'Amount, low to high' },
  { value: LIST_SORT.DUE_SOONEST, label: 'Valid until, soonest' },
];

/** How many filters differ from the defaults (the badge on the Filters button; the sort order is not a filter). */
export const activeFilterCount = (f: QuotationFilterState) => [f.amount !== LIST_FILTER.ALL, Boolean(f.from || f.to)].filter(Boolean).length;

/** Amount and Date (from / to), in one sheet; the status is the pills on the list. */
export function QuotationFilterSheet({ visible, value, onChange, onClose }: {
  visible: boolean; value: QuotationFilterState; onChange: (next: QuotationFilterState) => void; onClose: () => void;
}) {
  const styles = useThemed(makeStyles);
  const set = (patch: Partial<QuotationFilterState>) => onChange({ ...value, ...patch });
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Filters</Text>
          <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <PickerField label="Amount" value={value.amount} options={AMOUNT_OPTIONS} onChange={(amount) => set({ amount })} />
            <DateField label="Date from" value={value.from} onChange={(from) => set({ from })} onClear={() => set({ from: '' })} />
            <DateField label="Date to" value={value.to} onChange={(to) => set({ to })} onClear={() => set({ to: '' })} />
          </ScrollView>
          <View style={styles.buttons}>
            <Button title="Clear all" tone="secondary" style={{ flex: 1 }} onPress={() => onChange({ ...DEFAULT_QUOTATION_FILTERS, sort: value.sort })} />
            <Button title="Done" style={{ flex: 1 }} onPress={onClose} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: c.surface, maxHeight: '85%', padding: spacing.lg, gap: spacing.md, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    title: { ...type.title3, color: c.ink },
    buttons: { flexDirection: 'row', gap: spacing.md },
  });
