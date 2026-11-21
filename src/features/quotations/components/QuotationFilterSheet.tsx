import { Ionicons } from '@expo/vector-icons';
import { AMOUNT_RANGES, LIST_FILTER, LIST_SORT } from 'floman-shared/constants';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/Button';
import { Text } from '@/components/AppText';
import { DateField } from '@/components/DateField';
import { PickerField } from '@/components/PickerField';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

export type QuotationFilterState = { amount: string; from: string; to: string; sort: string; customer: { id: string; name: string } | null };

export const DEFAULT_QUOTATION_FILTERS: QuotationFilterState = { amount: LIST_FILTER.ALL, from: '', to: '', sort: LIST_SORT.NEWEST, customer: null };

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
export const activeFilterCount = (f: QuotationFilterState) => [Boolean(f.customer), f.amount !== LIST_FILTER.ALL, Boolean(f.from || f.to)].filter(Boolean).length;

/** Customer, Amount and Date (from / to), in one sheet; the status is the pills on the list. */
export function QuotationFilterSheet({ visible, value, onChange, onPickCustomer, onClose }: {
  visible: boolean; value: QuotationFilterState; onChange: (next: QuotationFilterState) => void;
  /** Opens the customer list (the screen closes this sheet first: a phone can't show two at once). */
  onPickCustomer: () => void; onClose: () => void;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const set = (patch: Partial<QuotationFilterState>) => onChange({ ...value, ...patch });
  return (
    <SheetModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Filters</Text>
          <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.label}>Customer</Text>
              <Pressable
                onPress={onPickCustomer}
                accessibilityRole="button"
                accessibilityLabel={`Customer: ${value.customer?.name ?? 'all customers'}`}
                style={({ pressed }) => [styles.box, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.boxText, !value.customer && { color: colors.placeholder }]} numberOfLines={1}>
                  {value.customer ? hide.text(value.customer.name) : 'All customers'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.muted} />
              </Pressable>
              {value.customer ? (
                <Pressable onPress={() => set({ customer: null })} accessibilityRole="button" accessibilityLabel="Clear customer" style={styles.clear}>
                  <Text style={[type.subhead, { fontWeight: '600', color: colors.brandText }]}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
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
    </SheetModal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: c.surface, maxHeight: '85%', padding: spacing.lg, gap: spacing.md, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    title: { ...type.title3, color: c.ink },
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    box: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 48, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, borderRadius: 12, paddingHorizontal: spacing.md },
    boxText: { ...type.body, flex: 1, color: c.ink },
    clear: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
    buttons: { flexDirection: 'row', gap: spacing.md },
  });
