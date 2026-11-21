import { Ionicons } from '@expo/vector-icons';
import { LIST_FILTER, LIST_SORT } from 'floman-shared/constants';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { PickerField } from '@/components/PickerField';
import { SheetModal } from '@/components/SheetModal';
import { useHide } from '@/lib/privacy';
import { AMOUNT_OPTIONS } from '@/features/quotations/components/QuotationFilterSheet';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

export type PurchaseOrderFilterState = { amount: string; from: string; to: string; sort: string; vendor: { id: string; name: string } | null };

export const DEFAULT_PURCHASE_ORDER_FILTERS: PurchaseOrderFilterState = { amount: LIST_FILTER.ALL, from: '', to: '', sort: LIST_SORT.NEWEST, vendor: null };

// The choices and their words are the web's (client features/purchase-orders/pages/PurchaseOrders.tsx).
export const SORT_OPTIONS = [
  { value: LIST_SORT.NEWEST, label: 'Newest' },
  { value: LIST_SORT.OLDEST, label: 'Oldest' },
  { value: LIST_SORT.AMOUNT_HIGH, label: 'Amount, high to low' },
  { value: LIST_SORT.AMOUNT_LOW, label: 'Amount, low to high' },
  { value: LIST_SORT.DUE_SOONEST, label: 'Due soonest' },
];

/** How many filters differ from the defaults (the badge on the Filters button; the sort order is not a filter). */
export const activeFilterCount = (f: PurchaseOrderFilterState) => [Boolean(f.vendor), f.amount !== LIST_FILTER.ALL, Boolean(f.from || f.to)].filter(Boolean).length;

/** Vendor, Amount and Date (from / to), in one sheet; the status is the pills on the list. */
export function PurchaseOrderFilterSheet({ visible, value, onChange, onPickVendor, onClose }: {
  visible: boolean; value: PurchaseOrderFilterState; onChange: (next: PurchaseOrderFilterState) => void;
  /** Opens the vendor list (the screen closes this sheet first: a phone can't show two at once). */
  onPickVendor: () => void; onClose: () => void;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const set = (patch: Partial<PurchaseOrderFilterState>) => onChange({ ...value, ...patch });
  return (
    <SheetModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Filters</Text>
          <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.label}>Vendor</Text>
              <Pressable
                onPress={onPickVendor}
                accessibilityRole="button"
                accessibilityLabel={`Vendor: ${value.vendor?.name ?? 'all vendors'}`}
                style={({ pressed }) => [styles.box, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.boxText, !value.vendor && { color: colors.placeholder }]} numberOfLines={1}>
                  {value.vendor ? hide.text(value.vendor.name) : 'All vendors'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.muted} />
              </Pressable>
              {value.vendor ? (
                <Pressable onPress={() => set({ vendor: null })} accessibilityRole="button" accessibilityLabel="Clear vendor" style={styles.clear}>
                  <Text style={[type.subhead, { fontWeight: '600', color: colors.brandText }]}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <PickerField label="Amount" value={value.amount} options={AMOUNT_OPTIONS} onChange={(amount) => set({ amount })} />
            <DateField label="Date from" value={value.from} onChange={(from) => set({ from })} onClear={() => set({ from: '' })} />
            <DateField label="Date to" value={value.to} onChange={(to) => set({ to })} onClear={() => set({ to: '' })} />
          </ScrollView>
          <View style={styles.buttons}>
            <Button title="Clear all" tone="secondary" style={{ flex: 1 }} onPress={() => onChange({ ...DEFAULT_PURCHASE_ORDER_FILTERS, sort: value.sort })} />
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
