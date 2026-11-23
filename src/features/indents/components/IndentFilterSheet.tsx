import { LIST_FILTER, LIST_SORT } from 'floman-shared/constants';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { PickerField } from '@/components/PickerField';
import { SheetModal } from '@/components/SheetModal';
import { spacing, type, useThemed, type Colors } from '@/theme';
import { PRIORITY_CHOICES } from '../text';

export type IndentFilterState = { priority: string; department: string; from: string; to: string; sort: string };

export const DEFAULT_INDENT_FILTERS: IndentFilterState = { priority: LIST_FILTER.ALL, department: LIST_FILTER.ALL, from: '', to: '', sort: LIST_SORT.NEWEST };

// The choices and their words are the web's (client features/indents/pages/Indents.tsx).
export const SORT_OPTIONS = [
  { value: LIST_SORT.NEWEST, label: 'Newest' },
  { value: LIST_SORT.OLDEST, label: 'Oldest' },
  { value: LIST_SORT.DUE_SOONEST, label: 'Required by, soonest' },
];

/** How many filters differ from the defaults (the badge on the Filters button; the sort order is not a filter). */
export const activeFilterCount = (f: IndentFilterState) => [f.priority !== LIST_FILTER.ALL, f.department !== LIST_FILTER.ALL, Boolean(f.from || f.to)].filter(Boolean).length;

/** Department, Priority and Date (from / to), in one sheet; the status is the pills on the list. */
export function IndentFilterSheet({ visible, value, departments, onChange, onClose }: {
  visible: boolean; value: IndentFilterState; departments: { id: string; name: string }[]; onChange: (next: IndentFilterState) => void; onClose: () => void;
}) {
  const styles = useThemed(makeStyles);
  const set = (patch: Partial<IndentFilterState>) => onChange({ ...value, ...patch });
  return (
    <SheetModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Filters</Text>
          <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
            {departments.length > 0 ? (
              <PickerField label="Department" value={value.department} options={[{ value: LIST_FILTER.ALL, label: 'Any' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]} onChange={(department) => set({ department })} />
            ) : null}
            <PickerField label="Priority" value={value.priority} options={[{ value: LIST_FILTER.ALL, label: 'Any' }, ...PRIORITY_CHOICES]} onChange={(priority) => set({ priority })} />
            <DateField label="Date from" value={value.from} onChange={(from) => set({ from })} onClear={() => set({ from: '' })} />
            <DateField label="Date to" value={value.to} onChange={(to) => set({ to })} onClear={() => set({ to: '' })} />
          </ScrollView>
          <View style={styles.buttons}>
            <Button title="Clear all" tone="secondary" style={{ flex: 1 }} onPress={() => onChange({ ...DEFAULT_INDENT_FILTERS, sort: value.sort })} />
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
    buttons: { flexDirection: 'row', gap: spacing.md },
  });
