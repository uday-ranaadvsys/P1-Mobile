import { LIST_FILTER } from 'floman-shared/constants';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { PickerField } from '@/components/PickerField';
import { spacing, type, useThemed, type Colors } from '@/theme';
import type { Department, UserRole } from '../api';

export type UserFilterState = { role: string; department: string; status: string };

export const DEFAULT_USER_FILTERS: UserFilterState = { role: LIST_FILTER.ALL, department: LIST_FILTER.ALL, status: 'active' };

// The choices and their words are the web's (client features/users/pages/Users.tsx).
export const STATUS_CHIPS = [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];
export const STATUS_LABEL: Record<string, string> = { active: 'Active', inactive: 'Inactive', all: 'All' };

/** How many filters differ from the defaults (the badge on the Filters button). */
export const activeFilterCount = (f: UserFilterState) =>
  [f.role !== LIST_FILTER.ALL, f.department !== LIST_FILTER.ALL].filter(Boolean).length;

/** Role and Department in one sheet; Status is the Active / Inactive / All pills on the list. */
export function UserFilterSheet({ visible, value, roles, departments, onChange, onClose }: {
  visible: boolean; value: UserFilterState; roles: UserRole[]; departments: Department[]; onChange: (next: UserFilterState) => void; onClose: () => void;
}) {
  const styles = useThemed(makeStyles);
  const set = (patch: Partial<UserFilterState>) => onChange({ ...value, ...patch });
  const all = { value: LIST_FILTER.ALL, label: 'All' };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Filters</Text>
          <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
            {roles.length > 0 ? <PickerField label="Role" value={value.role} options={[all, ...roles.map((r) => ({ value: r.id, label: r.name }))]} onChange={(role) => set({ role })} /> : null}
            {departments.length > 0 ? <PickerField label="Department" value={value.department} options={[all, ...departments.map((d) => ({ value: d.id, label: d.name }))]} onChange={(department) => set({ department })} /> : null}
          </ScrollView>
          <View style={styles.buttons}>
            <Button title="Clear all" tone="secondary" style={{ flex: 1 }} onPress={() => onChange(DEFAULT_USER_FILTERS)} />
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
