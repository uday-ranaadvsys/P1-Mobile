import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/AppText';
import { radius, spacing, type, useColors, useThemed, type Colors } from '@/theme';

export type SheetOption = { value: string; label: string };

/**
 * A bottom sheet with a list to choose one from (a state, a sort order). It has a search box when the list is
 * long. Each row is at least 48 pt tall; the chosen one has a tick.
 */
export function OptionSheet({ visible, title, options, value, onSelect, onClose, searchable }: {
  visible: boolean; title: string; options: SheetOption[]; value: string; onSelect: (value: string) => void; onClose: () => void; searchable?: boolean;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const [query, setQuery] = useState('');
  const shown = query.trim() ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options;

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button" style={styles.close}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          {(searchable ?? options.length > 8) ? (
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={colors.placeholder}
                style={styles.searchInput}
                autoCorrect={false}
                accessibilityLabel={`Search ${title}`}
              />
            </View>
          ) : null}
          <FlatList
            data={shown}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item.value);
                  close();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: item.value === value }}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.rowText, item.value === value && { fontWeight: '700' }]}>{item.label}</Text>
                {item.value === value ? <Ionicons name="checkmark" size={20} color={colors.brandText} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.empty}>Nothing matches.</Text>}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: c.surface, maxHeight: '75%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: spacing.lg },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.md },
    title: { ...type.title3, color: c.ink },
    close: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
    closeText: { ...type.headline, color: c.brandText },
    search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, margin: spacing.md, paddingHorizontal: spacing.md, minHeight: 44, borderRadius: radius, backgroundColor: c.background },
    searchInput: { ...type.body, flex: 1, color: c.ink, fontFamily: 'Inter_400Regular', paddingVertical: 10 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    rowText: { ...type.body, color: c.ink },
    empty: { ...type.subhead, color: c.muted, padding: spacing.md },
  });
