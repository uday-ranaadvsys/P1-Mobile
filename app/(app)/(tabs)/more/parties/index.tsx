import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { LIST_FILTER, PAGINATION, PARTY_TYPE } from 'floman-shared/constants';
import { PERMISSIONS } from 'floman-shared/permissions';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { OptionSheet } from '@/components/OptionSheet';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { listParties, type Party, type PartyStats } from '@/features/parties/api';
import { PartyFilterSheet, DEFAULT_PARTY_FILTERS, SORT_OPTIONS, STATUS_LABEL, activeFilterCount, type PartyFilterState } from '@/features/parties/components/PartyFilterSheet';
import { PartyRow } from '@/features/parties/components/PartyRow';
import { useToggleParty } from '@/features/parties/useToggleParty';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** The cards on the web's Vendors & Customers screen, as chips. */
const FOCUS = { ALL: 'ALL', CUSTOMERS: 'CUSTOMERS', VENDORS: 'VENDORS' } as const;
type Focus = (typeof FOCUS)[keyof typeof FOCUS];

/**
 * Vendors & Customers: a title with the way back to Masters, search and filters, swipeable chips with counts,
 * then every party as a row with what is owed. Tap opens a party,
 * long-press its actions, the red + in the tab bar adds one.
 */
export default function Parties() {
  const router = useRouter();
  const { can } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const canUpdate = can(PERMISSIONS.VENDORS.UPDATE);
  const toggleParty = useToggleParty((message) => Alert.alert(message));

  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState<Focus>(FOCUS.ALL);
  const [filters, setFilters] = useState<PartyFilterState>(DEFAULT_PARTY_FILTERS);
  const [filterSheet, setFilterSheet] = useState(false);
  const [sortSheet, setSortSheet] = useState(false);

  // Search as you type (a moment after the last key).
  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const type_ = focus === FOCUS.CUSTOMERS ? PARTY_TYPE.CUSTOMER : focus === FOCUS.VENDORS ? PARTY_TYPE.VENDOR : undefined;
  const query = useInfiniteQuery({
    queryKey: ['parties', { search, focus, ...filters }],
    initialPageParam: PAGINATION.DEFAULT_PAGE as number,
    queryFn: ({ pageParam }) =>
      listParties(pageParam, PAGINATION.DEFAULT_LIMIT, {
        search: search || undefined,
        type: type_,
        status: filters.status,
        sort: filters.sort,
        gst: filters.gst !== LIST_FILTER.ALL ? filters.gst : undefined,
        state: filters.state !== LIST_FILTER.ALL ? filters.state : undefined,
      }),
    // Keep the list on screen while a new search loads, so typing in the search box is never interrupted.
    placeholderData: keepPreviousData,
    getNextPageParam: (last) => (last.meta && last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });

  const parties = query.data?.pages.flatMap((p) => p.rows) ?? [];
  const stats = query.data?.pages[0]?.meta?.stats as PartyStats | undefined;
  const matching = query.data?.pages[0]?.meta?.total ?? 0;
  const filterCount = activeFilterCount(filters);

  const chips: { key: Focus; label: string; count?: number }[] = [
    { key: FOCUS.ALL, label: 'All', count: stats?.total },
    { key: FOCUS.CUSTOMERS, label: 'Customers', count: stats?.customers },
    { key: FOCUS.VENDORS, label: 'Vendors', count: stats?.vendors },
  ];

  const open = (party: Party) => router.push({ pathname: '/more/parties/[id]', params: { id: party.id } });
  // Long-press: the actions the web has in a row's menu (Edit, Deactivate / Reactivate).
  const actions = (party: Party) =>
    Alert.alert(party.name, undefined, [
      { text: 'Edit', onPress: () => router.push({ pathname: '/more/parties/edit', params: { id: party.id } }) },
      { text: party.isActive ? 'Deactivate' : 'Reactivate', style: party.isActive ? 'destructive' : 'default', onPress: () => toggleParty.toggle(party) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const header = (
    <View style={styles.header}>
      <ScreenTitle
        back="Masters"
        title="Vendors & Customers"
        right={
          <Pressable
            onPress={() => void query.refetch()}
            accessibilityRole="button"
            accessibilityLabel="Refresh"
            style={({ pressed }) => [styles.square, pressed && { opacity: 0.6 }]}
          >
            {query.isRefetching ? <ActivityIndicator color={colors.muted} /> : <Ionicons name="refresh" size={22} color={colors.ink} />}
          </Pressable>
        }
      />

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder="Search name, GSTIN, city…"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search vendors and customers"
          />
          {typed ? (
            <Pressable onPress={() => setTyped('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setFilterSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={filterCount ? `Filters, ${filterCount} on` : 'Filters'}
          style={({ pressed }) => [styles.square, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="options-outline" size={22} color={colors.ink} />
          {filterCount > 0 ? (
            <View style={styles.badge}><Text style={styles.badgeText}>{filterCount}</Text></View>
          ) : null}
        </Pressable>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={chips}
        keyExtractor={(c) => c.key}
        // Chips line up with the content and scroll out to the screen edge.
        style={styles.chips}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}
        renderItem={({ item }) => {
          const active = focus === item.key;
          return (
            <Pressable
              onPress={() => setFocus(active && item.key !== FOCUS.ALL ? FOCUS.ALL : item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {item.label}
                {item.count !== undefined ? <Text style={{ color: colors.muted, fontWeight: '400' }}> {item.count}</Text> : null}
              </Text>
            </Pressable>
          );
        }}
      />

      <View style={styles.meta}>
        <Text style={styles.metaText}>
          {matching} {matching === 1 ? 'party' : 'parties'} · <Text style={styles.metaBold}>{STATUS_LABEL[filters.status] ?? filters.status}</Text>
        </Text>
        <Pressable onPress={() => setSortSheet(true)} accessibilityRole="button" accessibilityLabel="Sort" style={({ pressed }) => [styles.sort, pressed && { opacity: 0.6 }]}>
          <Text style={styles.metaText}>
            Sort: <Text style={styles.metaBold}>{SORT_OPTIONS.find((o) => o.value === filters.sort)?.label}</Text> ▾
          </Text>
        </Pressable>
      </View>
    </View>
  );

  if (query.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (query.error) {
    return (
      <Centered>
        <ErrorText message={query.error instanceof Error ? query.error.message : null} />
        <Button title="Try again" tone="secondary" onPress={() => void query.refetch()} />
      </Centered>
    );
  }

  return (
    <>
      <FlatList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.list}
        data={parties}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <PartyRow party={item} onOpen={() => open(item)} onActions={canUpdate ? () => actions(item) : undefined} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No vendors or customers found</Text>
            <Text style={styles.emptyText}>
              {search || filterCount || focus !== FOCUS.ALL ? 'No one matches the search or filters.' : 'Add the people you buy from and sell to.'}
            </Text>
          </View>
        }
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={{ margin: spacing.md }} color={colors.brandText} /> : undefined}
        onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && void query.fetchNextPage()}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={colors.brandText} />}
      />
      <PartyFilterSheet visible={filterSheet} value={filters} onChange={setFilters} onClose={() => setFilterSheet(false)} />
      <OptionSheet visible={sortSheet} title="Sort" options={SORT_OPTIONS} value={filters.sort} onSelect={(sort) => setFilters({ ...filters, sort })} onClose={() => setSortSheet(false)} />
    </>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    list: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg * 2 },
    header: { gap: spacing.md, marginBottom: spacing.sm },
    square: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, paddingHorizontal: spacing.md },
    searchInput: { ...type.body, flex: 1, color: c.ink, fontFamily: 'Inter_400Regular', paddingVertical: 10 },
    badge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    badgeText: { ...type.footnoteBold, color: '#FFFFFF' },
    chips: { marginHorizontal: -spacing.md, flexGrow: 0 },
    chip: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, justifyContent: 'center' },
    chipActive: { borderColor: c.brandText, backgroundColor: c.brandTint },
    chipText: { ...type.subhead, fontWeight: '600', color: c.ink },
    chipTextActive: { color: c.ink },
    meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
    metaText: { ...type.subhead, color: c.muted },
    metaBold: { color: c.ink, fontWeight: '700' },
    sort: { minHeight: 44, justifyContent: 'center' },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: c.divider },
    empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg * 2 },
    emptyTitle: { ...type.headline, color: c.ink },
    emptyText: { ...type.subhead, color: c.muted, textAlign: 'center' },
  });
