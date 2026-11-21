import { LIST_FILTER, PARTY_GST } from 'floman-shared/constants';
import { GST_STATES } from 'floman-shared/gst';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SheetModal } from '@/components/SheetModal';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { OptionPills } from '@/components/FormParts';
import { PickerField } from '@/components/PickerField';
import { spacing, type, useThemed, type Colors } from '@/theme';

export type PartyFilterState = { status: string; gst: string; state: string; sort: string };

export const DEFAULT_PARTY_FILTERS: PartyFilterState = { status: 'active', gst: LIST_FILTER.ALL, state: LIST_FILTER.ALL, sort: 'NAME' };

// The choices and their words are the web's (client features/vendors/pages/Vendors.tsx).
const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All' }];
const GST_OPTIONS = [
  { value: LIST_FILTER.ALL, label: 'All' },
  { value: PARTY_GST.REGISTERED, label: 'Registered' },
  { value: PARTY_GST.UNREGISTERED, label: 'Unregistered' },
];
/** The ways to order the list (the web's Sort), chosen from the list's own Sort control. */
export const SORT_OPTIONS = [
  { value: 'NAME', label: 'Name A–Z' },
  { value: 'NEWEST', label: 'Newest' },
  { value: 'RECEIVE', label: 'Most to receive' },
  { value: 'PAY', label: 'Most to pay' },
];
export const STATUS_LABEL: Record<string, string> = { active: 'Active', inactive: 'Inactive', all: 'All' };
const STATE_OPTIONS = [{ value: LIST_FILTER.ALL, label: 'All' }, ...GST_STATES.map((s) => ({ value: s.name, label: s.name }))];

/** How many filters differ from the defaults (the badge on the Filters button; the sort order is not a filter). */
export const activeFilterCount = (f: PartyFilterState) =>
  [f.status !== DEFAULT_PARTY_FILTERS.status, f.gst !== LIST_FILTER.ALL, f.state !== LIST_FILTER.ALL].filter(Boolean).length;

/** Status, GST and State, in one sheet (the web has them as drop-downs above the table). */
export function PartyFilterSheet({ visible, value, onChange, onClose }: {
  visible: boolean; value: PartyFilterState; onChange: (next: PartyFilterState) => void; onClose: () => void;
}) {
  const styles = useThemed(makeStyles);
  const set = (patch: Partial<PartyFilterState>) => onChange({ ...value, ...patch });
  return (
    <SheetModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Filters</Text>
          <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.label}>Status</Text>
              <OptionPills label="Status" options={STATUS_OPTIONS} value={value.status} onChange={(status) => set({ status })} />
            </View>
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.label}>GST</Text>
              <OptionPills label="GST" options={GST_OPTIONS} value={value.gst} onChange={(gst) => set({ gst })} />
            </View>
            <PickerField label="State" value={value.state} options={STATE_OPTIONS} onChange={(state) => set({ state })} searchable />
          </ScrollView>
          <View style={styles.buttons}>
            <Button title="Clear all" tone="secondary" style={{ flex: 1 }} onPress={() => onChange({ ...DEFAULT_PARTY_FILTERS, sort: value.sort })} />
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
