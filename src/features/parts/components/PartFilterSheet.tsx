import { LIST_FILTER, PART_TYPE } from 'floman-shared/constants';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SheetModal } from '@/components/SheetModal';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { OptionPills } from '@/components/FormParts';
import { PickerField } from '@/components/PickerField';
import { spacing, type, useThemed, type Colors } from '@/theme';
import type { PartGroup } from '../api';

export type PartFilterState = { status: string; type: string; group: string; sort: string };

export const DEFAULT_PART_FILTERS: PartFilterState = { status: 'active', type: LIST_FILTER.ALL, group: LIST_FILTER.ALL, sort: 'NAME' };

// The choices and their words are the web's (client features/parts/pages/Parts.tsx).
const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All' }];
const TYPE_OPTIONS = [
  { value: LIST_FILTER.ALL, label: 'All' },
  { value: PART_TYPE.PRODUCT, label: 'Product' },
  { value: PART_TYPE.SERVICE, label: 'Service' },
];
export const SORT_OPTIONS = [
  { value: 'NAME', label: 'Name A–Z' },
  { value: 'NEWEST', label: 'Newest' },
  { value: 'STOCK_LOW', label: 'Stock, lowest' },
  { value: 'PRICE_HIGH', label: 'Selling price, highest' },
];
export const STATUS_LABEL: Record<string, string> = { active: 'Active', inactive: 'Inactive', all: 'All' };

/** How many filters differ from the defaults (the badge on the Filters button; the sort order is not a filter). */
export const activeFilterCount = (f: PartFilterState) =>
  [f.status !== DEFAULT_PART_FILTERS.status, f.type !== LIST_FILTER.ALL, f.group !== LIST_FILTER.ALL].filter(Boolean).length;

/** Type, Group and Status, in one sheet (the web has them as drop-downs above the table). */
export function PartFilterSheet({ visible, value, groups, onChange, onClose }: {
  visible: boolean; value: PartFilterState; groups: PartGroup[]; onChange: (next: PartFilterState) => void; onClose: () => void;
}) {
  const styles = useThemed(makeStyles);
  const set = (patch: Partial<PartFilterState>) => onChange({ ...value, ...patch });
  const groupOptions = [{ value: LIST_FILTER.ALL, label: 'All' }, ...groups.map((g) => ({ value: g.id, label: g.name }))];
  return (
    <SheetModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Filters</Text>
          <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.label}>Type</Text>
              <OptionPills label="Type" options={TYPE_OPTIONS} value={value.type} onChange={(next) => set({ type: next })} />
            </View>
            <PickerField label="Group" value={value.group} options={groupOptions} onChange={(group) => set({ group })} />
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.label}>Status</Text>
              <OptionPills label="Status" options={STATUS_OPTIONS} value={value.status} onChange={(status) => set({ status })} />
            </View>
          </ScrollView>
          <View style={styles.buttons}>
            <Button title="Clear all" tone="secondary" style={{ flex: 1 }} onPress={() => onChange({ ...DEFAULT_PART_FILTERS, sort: value.sort })} />
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
    buttons: { flexDirection: 'row', gap: spacing.md },
  });
