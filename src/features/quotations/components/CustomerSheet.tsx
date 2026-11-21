import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PARTY_TYPE } from 'floman-shared/constants';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/AppText';
import { listParties, type Party } from '@/features/parties/api';
import { gstinText, placeLine } from '@/features/parties/text';
import { useHide } from '@/lib/privacy';
import { radius, spacing, type, useColors, useThemed, type Colors } from '@/theme';

const LIMIT = 50;

/** A bottom sheet to pick the customer: active customers, searched on the server as you type. */
export function CustomerSheet({ visible, selectedId, onPick, onClose }: { visible: boolean; selectedId?: string; onPick: (party: Party) => void; onClose: () => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const query = useQuery({
    queryKey: ['quotation-customers', search],
    queryFn: () => listParties(1, LIMIT, { type: PARTY_TYPE.CUSTOMER, status: 'active', search: search || undefined, sort: 'NAME' }),
    enabled: visible,
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.rows ?? [];
  const total = query.data?.meta?.total ?? rows.length;

  const close = () => {
    setTyped('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Customer</Text>
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button" style={styles.close}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder="Search customers…"
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Search customers"
            />
            {query.isFetching ? <ActivityIndicator size="small" color={colors.muted} /> : null}
          </View>
          <FlatList
            data={rows}
            keyExtractor={(p) => p.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onPick(item);
                  close();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: item.id === selectedId }}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.name, item.id === selectedId && { fontWeight: '700' }]} numberOfLines={2}>{hide.text(item.name)}</Text>
                  <Text style={styles.sub} numberOfLines={1}>{gstinText(item)} · {hide.text(placeLine(item))}</Text>
                </View>
                {item.id === selectedId ? <Ionicons name="checkmark" size={20} color={colors.brandText} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={query.isLoading ? <ActivityIndicator style={{ margin: spacing.lg }} color={colors.brandText} /> : <Text style={styles.empty}>{query.error ? 'Could not load customers.' : 'No customers match.'}</Text>}
            ListFooterComponent={total > rows.length ? <Text style={styles.empty}>Showing {rows.length} of {total}. Type to find the rest.</Text> : undefined}
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
    sheet: { backgroundColor: c.surface, height: '75%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: spacing.lg },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.md },
    title: { ...type.title3, color: c.ink },
    close: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
    closeText: { ...type.headline, color: c.brandText },
    search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, margin: spacing.md, paddingHorizontal: spacing.md, minHeight: 44, borderRadius: radius, backgroundColor: c.background },
    searchInput: { ...type.body, flex: 1, color: c.ink, fontFamily: 'Inter_400Regular', paddingVertical: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    name: { ...type.body, color: c.ink },
    sub: { ...type.footnote, color: c.muted },
    empty: { ...type.subhead, color: c.muted, padding: spacing.md, textAlign: 'center' },
  });
