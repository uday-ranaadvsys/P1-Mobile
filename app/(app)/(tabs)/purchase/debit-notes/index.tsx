import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { LIST_FILTER, PAGINATION, PARTY_TYPE } from 'floman-shared/constants';
import { NOTE_STATUS } from 'floman-shared/statuses';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { OptionSheet } from '@/components/OptionSheet';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { PartySheet } from '@/features/parties/components/PartySheet';
import { listDebitNotes, type DebitNoteStats } from '@/features/debit-notes/api';
import { DebitNoteRow } from '@/features/debit-notes/components/DebitNoteRow';
import { statusLabel, UNUSED } from '@/features/debit-notes/text';
import { useDebitNoteActions } from '@/features/debit-notes/useDebitNoteActions';
import { PurchaseOrderFilterSheet, DEFAULT_PURCHASE_ORDER_FILTERS, SORT_OPTIONS, activeFilterCount, type PurchaseOrderFilterState } from '@/features/purchase-orders/components/PurchaseOrderFilterSheet';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** The status pills (All first), with the counts the web's cards show; "Unused" is approved notes with an amount not linked or refunded yet. */
const STATUS_PILLS: { value: string; count?: (s: DebitNoteStats) => number }[] = [
  { value: LIST_FILTER.ALL, count: (s) => s.total },
  { value: NOTE_STATUS.DRAFT, count: (s) => s.draft },
  { value: NOTE_STATUS.PENDING_APPROVAL, count: (s) => s.pendingApproval },
  { value: NOTE_STATUS.RETURNED, count: (s) => s.returned },
  { value: NOTE_STATUS.APPROVED, count: (s) => s.issued },
  { value: UNUSED, count: (s) => s.unused },
  { value: NOTE_STATUS.CANCELLED, count: (s) => s.cancelled },
];

/**
 * Debit Notes: a title with the way back to Purchase, search and filters, swipeable status pills with counts (All
 * first), then every Debit Note as a row. Tap opens one; the red + in the tab bar makes a new one.
 */
export default function DebitNotes() {
  const router = useRouter();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();

  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(LIST_FILTER.ALL);
  const [filters, setFilters] = useState<PurchaseOrderFilterState>(DEFAULT_PURCHASE_ORDER_FILTERS);
  const [filterSheet, setFilterSheet] = useState(false);
  const [sortSheet, setSortSheet] = useState(false);
  const [vendorSheet, setVendorSheet] = useState(false);
  // Long-press a row (or the dots on its detail): Edit, Approve, Return, Share PDF, Cancel, Restore.
  const actions = useDebitNoteActions();

  // Search as you type (a moment after the last key).
  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const query = useInfiniteQuery({
    queryKey: ['debit-notes', { search, status, ...filters }],
    initialPageParam: PAGINATION.DEFAULT_PAGE as number,
    queryFn: ({ pageParam }) =>
      listDebitNotes(pageParam, PAGINATION.DEFAULT_LIMIT, {
        search: search || undefined,
        status: status !== LIST_FILTER.ALL && status !== UNUSED ? status : undefined,
        unused: status === UNUSED,
        sort: filters.sort,
        amount: filters.amount !== LIST_FILTER.ALL ? filters.amount : undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        vendorId: filters.vendor?.id,
      }),
    placeholderData: keepPreviousData,
    getNextPageParam: (last) => (last.meta && last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });

  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];
  const stats = query.data?.pages[0]?.meta?.stats;
  const matching = query.data?.pages[0]?.meta?.total ?? 0;
  const filterCount = activeFilterCount(filters);
  const label = (value: string) => (value === LIST_FILTER.ALL ? 'All' : statusLabel(value));

  const header = (
    <View style={styles.header}>
      <ScreenTitle
        back="Purchase"
        title="Debit Notes"
        right={
          <Pressable onPress={() => void query.refetch()} accessibilityRole="button" accessibilityLabel="Refresh" style={({ pressed }) => [styles.square, pressed && { opacity: 0.6 }]}>
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
            placeholder="Search in debit notes…"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search debit notes"
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
          {filterCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{filterCount}</Text></View> : null}
        </Pressable>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={STATUS_PILLS}
        keyExtractor={(p) => p.value}
        style={styles.chips}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}
        renderItem={({ item }) => {
          const active = status === item.value;
          const count = stats && item.count ? item.count(stats) : undefined;
          return (
            <Pressable
              onPress={() => setStatus(item.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.chipText}>
                {label(item.value)}
                {typeof count === 'number' ? <Text style={{ color: colors.muted, fontWeight: '400' }}> {count}</Text> : null}
              </Text>
            </Pressable>
          );
        }}
      />

      {filters.vendor ? (
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setFilters({ ...filters, vendor: null })}
            accessibilityRole="button"
            accessibilityLabel={`Remove the vendor filter: ${filters.vendor.name}`}
            style={({ pressed }) => [styles.filterChip, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.filterChipText} numberOfLines={1}>Vendor: {hide.text(filters.vendor.name)}</Text>
            <Ionicons name="close" size={16} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.meta}>
        <Text style={styles.metaText}>
          {matching} {matching === 1 ? 'debit note' : 'debit notes'} · <Text style={styles.metaBold}>{label(status)}</Text>
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
        data={rows}
        keyExtractor={(n) => n.id}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <DebitNoteRow note={item} onOpen={() => router.push({ pathname: '/purchase/debit-notes/[id]', params: { id: item.id } })} onActions={() => actions.open(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Debit Notes Found</Text>
            <Text style={styles.emptyText}>
              {search || filterCount || status !== LIST_FILTER.ALL ? 'No Debit Notes match your current search or filters.' : 'No Debit Notes yet. Tap + to raise one against a GRN.'}
            </Text>
          </View>
        }
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={{ margin: spacing.md }} color={colors.brandText} /> : undefined}
        onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && void query.fetchNextPage()}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={colors.brandText} />}
      />
      <PurchaseOrderFilterSheet
        visible={filterSheet}
        value={filters}
        onChange={setFilters}
        // The vendor list opens once this sheet has closed (a phone can't show two at once).
        onPickVendor={() => {
          setFilterSheet(false);
          setTimeout(() => setVendorSheet(true), 400);
        }}
        onClose={() => setFilterSheet(false)}
      />
      <PartySheet visible={vendorSheet} title="Vendor" type={PARTY_TYPE.VENDOR} selectedId={filters.vendor?.id} onPick={(p) => setFilters({ ...filters, vendor: { id: p.id, name: p.name } })} onClose={() => setVendorSheet(false)} />
      {actions.sheets}
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
    chipRow: { flexDirection: 'row' },
    filterChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, maxWidth: '100%', paddingHorizontal: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface },
    filterChipText: { ...type.subhead, fontWeight: '600', color: c.ink, flexShrink: 1 },
    meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
    metaText: { ...type.subhead, color: c.muted },
    metaBold: { color: c.ink, fontWeight: '700' },
    sort: { minHeight: 44, justifyContent: 'center' },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: c.divider },
    empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg * 2 },
    emptyTitle: { ...type.headline, color: c.ink },
    emptyText: { ...type.subhead, color: c.muted, textAlign: 'center' },
  });
