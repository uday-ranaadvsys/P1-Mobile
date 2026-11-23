import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { LIST_FILTER, PAGINATION, PARTY_TYPE } from 'floman-shared/constants';
import { PURCHASE_STATUS } from 'floman-shared/statuses';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { OptionSheet } from '@/components/OptionSheet';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { PartySheet } from '@/features/parties/components/PartySheet';
import { listPurchases, type PurchaseStats } from '@/features/purchases/api';
import { PurchaseOrderFilterSheet, DEFAULT_PURCHASE_ORDER_FILTERS, SORT_OPTIONS, activeFilterCount, type PurchaseOrderFilterState } from '@/features/purchase-orders/components/PurchaseOrderFilterSheet';
import { PurchaseRow } from '@/features/purchases/components/PurchaseRow';
import { statusLabel, TO_RECEIVE } from '@/features/purchase-orders/text';
import { usePurchaseActions } from '@/features/purchases/usePurchaseActions';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** The status pills, in the order a Purchase Order moves (All first), with the counts the web's cards show. */
const STATUS_PILLS: { value: string; stat: keyof PurchaseStats }[] = [
  { value: LIST_FILTER.ALL, stat: 'total' },
  { value: PURCHASE_STATUS.DRAFT, stat: 'draft' },
  { value: PURCHASE_STATUS.PENDING_APPROVAL, stat: 'pendingApproval' },
  { value: PURCHASE_STATUS.RETURNED, stat: 'returned' },
  { value: TO_RECEIVE, stat: 'toReceive' },
  { value: PURCHASE_STATUS.APPROVED, stat: 'approved' },
  { value: PURCHASE_STATUS.PARTIALLY_RECEIVED, stat: 'partiallyReceived' },
  { value: PURCHASE_STATUS.RECEIVED, stat: 'received' },
  { value: PURCHASE_STATUS.CANCELLED, stat: 'cancelled' },
];

/**
 * Purchases: a title with the way back to Purchase, search and filters, swipeable status pills with counts (All first),
 * then every Purchase as a row. Tap opens one; the red + in the tab bar makes a new one.
 */
export default function Purchases() {
  const router = useRouter();
  const styles = useThemed(makeStyles);
  const colors = useColors();

  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(LIST_FILTER.ALL);
  const [filters, setFilters] = useState<PurchaseOrderFilterState>(DEFAULT_PURCHASE_ORDER_FILTERS);
  const [filterSheet, setFilterSheet] = useState(false);
  const [sortSheet, setSortSheet] = useState(false);
  const [vendorSheet, setVendorSheet] = useState(false);
  const hide = useHide();
  // Long-press a row (or the dots on its detail): Edit, Duplicate, View history, Cancel, Restore.
  const actions = usePurchaseActions();

  // Search as you type (a moment after the last key).
  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const query = useInfiniteQuery({
    queryKey: ['purchases', { search, status, ...filters }],
    initialPageParam: PAGINATION.DEFAULT_PAGE as number,
    queryFn: ({ pageParam }) =>
      listPurchases(pageParam, PAGINATION.DEFAULT_LIMIT, {
        search: search || undefined,
        status: status !== LIST_FILTER.ALL ? status : undefined,
        sort: filters.sort,
        amount: filters.amount !== LIST_FILTER.ALL ? filters.amount : undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        vendorId: filters.vendor?.id,
      }),
    // Keep the list on screen while a new search loads, so typing in the search box is never interrupted.
    placeholderData: keepPreviousData,
    getNextPageParam: (last) => (last.meta && last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });

  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];
  const stats = query.data?.pages[0]?.meta?.stats as PurchaseStats | undefined;
  const matching = query.data?.pages[0]?.meta?.total ?? 0;
  const filterCount = activeFilterCount(filters);
  const label = (value: string) => (value === LIST_FILTER.ALL ? 'All' : statusLabel(value));

  const header = (
    <View style={styles.header}>
      <ScreenTitle
        back="Purchase"
        title="Purchases"
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
            placeholder="Search in purchases…"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search purchases"
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
        // Pills line up with the content and scroll out to the screen edge.
        style={styles.chips}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}
        renderItem={({ item }) => {
          const active = status === item.value;
          const count = stats?.[item.stat];
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
          {matching} {matching === 1 ? 'purchase' : 'purchases'} · <Text style={styles.metaBold}>{label(status)}</Text>
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
        keyExtractor={(po) => po.id}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <PurchaseRow purchase={item} onOpen={() => router.push({ pathname: '/purchase/purchases/[id]', params: { id: item.id } })} onActions={() => actions.open(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Purchase Records Found</Text>
            <Text style={styles.emptyText}>
              {search || filterCount || status !== LIST_FILTER.ALL ? 'No Purchases match your current search or filters.' : 'No Purchases created yet. Tap + to make your first Purchase.'}
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
