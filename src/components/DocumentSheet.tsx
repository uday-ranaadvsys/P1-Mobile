import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/AppText';
import { SheetModal } from '@/components/SheetModal';
import { radius, spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** One choice in the list: its number, a line about it and the word on the right (a status). */
export type DocumentChoice = { id: string; title: string; subtitle?: string; right?: string };

/**
 * A bottom sheet to pick a document (a Purchase Order, a Purchase) as the source of another: the list comes from
 * `fetchChoices(search)`, searched on the server as you type. `noneLabel`: an extra first row that clears the choice.
 */
export function DocumentSheet({ visible, title, queryKey, fetchChoices, selectedId, searchPlaceholder, noneLabel, emptyText, onPick, onClose }: {
  visible: boolean; title: string; queryKey: string; fetchChoices: (search: string) => Promise<DocumentChoice[]>; selectedId?: string | null;
  searchPlaceholder: string; noneLabel?: string; emptyText: string; onPick: (choice: DocumentChoice | null) => void; onClose: () => void;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const query = useQuery({ queryKey: [queryKey, search], queryFn: () => fetchChoices(search), enabled: visible, placeholderData: keepPreviousData });
  const rows = query.data ?? [];

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
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
              <Ionicons name="close-circle" size={30} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput value={typed} onChangeText={setTyped} placeholder={searchPlaceholder} placeholderTextColor={colors.placeholder} style={styles.searchInput} autoCorrect={false} autoCapitalize="none" accessibilityLabel={searchPlaceholder} />
            {query.isFetching ? <ActivityIndicator size="small" color={colors.muted} /> : null}
          </View>
          {noneLabel ? (
            <Pressable
              onPress={() => {
                onPick(null);
                close();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.name, !selectedId && { fontWeight: '700' }]}>{noneLabel}</Text>
              {!selectedId ? <Ionicons name="checkmark" size={20} color={colors.brandText} /> : null}
            </Pressable>
          ) : null}
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
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
                  <Text style={[styles.name, item.id === selectedId && { fontWeight: '700' }]} numberOfLines={1}>{item.title}</Text>
                  {item.subtitle ? <Text style={styles.sub} numberOfLines={1}>{item.subtitle}</Text> : null}
                </View>
                {item.right ? <Text style={styles.sub}>{item.right}</Text> : null}
                {item.id === selectedId ? <Ionicons name="checkmark" size={20} color={colors.brandText} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={query.isLoading ? <ActivityIndicator style={{ margin: spacing.lg }} color={colors.brandText} /> : <Text style={styles.empty}>{query.error ? 'Could not load the list.' : emptyText}</Text>}
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
    search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, margin: spacing.md, paddingHorizontal: spacing.md, minHeight: 44, borderRadius: radius, backgroundColor: c.background },
    searchInput: { ...type.body, flex: 1, color: c.ink, fontFamily: 'Inter_400Regular', paddingVertical: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    name: { ...type.body, flex: 1, color: c.ink },
    sub: { ...type.footnote, color: c.muted },
    empty: { ...type.subhead, color: c.muted, padding: spacing.md, textAlign: 'center' },
  });
