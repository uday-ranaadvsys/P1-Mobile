import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SheetModal } from '@/components/SheetModal';
import { Text } from '@/components/AppText';
import { listParties, type Party } from '@/features/parties/api';
import { PARTY_TYPE } from 'floman-shared/constants';
import { gstinText, PARTY_TYPE_LABEL, placeLine } from '@/features/parties/text';
import { useHide } from '@/lib/privacy';
import { linkIndigo, radius, spacing, type, useColors, useThemed, type Colors } from '@/theme';

const LIMIT = 50;

/**
 * A bottom sheet to pick a customer or vendor (`title`): active parties, searched on the server as you type. `type`
 * limits it to one kind; none asks for all and the server limits the list to the user's side (someone with
 * Vendors: Read, such as an Admin, gets both).
 */
export function PartySheet({ visible, title, type: partyType, selectedId, onPick, onNew, onClose }: {
  visible: boolean; title: string; type?: string; selectedId?: string; onPick: (party: Party) => void; onClose: () => void;
  /** "New customer" / "New vendor": one that is not in Vendors & Customers yet (only for someone who may create them). */
  onNew?: () => void;
}) {
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
    queryKey: ['party-picker', partyType ?? 'all', search],
    // No type is asked for: the server limits the list to the user's side (someone with Vendors: Read, such as an Admin, gets both).
    queryFn: () => listParties(1, LIMIT, { type: partyType, status: 'active', search: search || undefined, sort: 'NAME' }),
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
    <SheetModal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button" style={styles.close}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder={`Search ${title.toLowerCase()}s…`}
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel={`Search ${title.toLowerCase()}s`}
            />
            {query.isFetching ? <ActivityIndicator size="small" color={colors.muted} /> : null}
          </View>
          {onNew ? (
            <Pressable
              onPress={() => {
                onNew();
                close();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.newRow, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="add-circle-outline" size={22} color={linkIndigo} />
              <Text style={[styles.newText, { color: linkIndigo }]}>New {title.toLowerCase()}</Text>
            </Pressable>
          ) : null}
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
                {/* The party's category as a badge on the right, as on the web (Customer: blue dot, Vendor: grey). */}
                <View style={styles.badge}>
                  <View style={[styles.dot, { backgroundColor: item.type === PARTY_TYPE.CUSTOMER ? colors.waitText : colors.faint }]} />
                  <Text style={styles.badgeText}>{PARTY_TYPE_LABEL[item.type] ?? item.type}</Text>
                </View>
                {item.id === selectedId ? <Ionicons name="checkmark" size={20} color={colors.brandText} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={query.isLoading ? <ActivityIndicator style={{ margin: spacing.lg }} color={colors.brandText} /> : <Text style={styles.empty}>{query.error ? `Could not load ${title.toLowerCase()}s.` : `No ${title.toLowerCase()}s match.`}</Text>}
            ListFooterComponent={total > rows.length ? <Text style={styles.empty}>Showing {rows.length} of {total}. Type to find the rest.</Text> : undefined}
          />
        </View>
      </KeyboardAvoidingView>
    </SheetModal>
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
    newRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md },
    newText: { ...type.headline },
    name: { ...type.body, color: c.ink },
    sub: { ...type.footnote, color: c.muted },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.track, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    badgeText: { ...type.footnoteBold, color: c.ink },
    empty: { ...type.subhead, color: c.muted, padding: spacing.md, textAlign: 'center' },
  });
