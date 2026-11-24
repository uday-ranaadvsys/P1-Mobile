import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { balanceInWords, ledgerListRows, LEDGER_FOCUS, LEDGER_LIST_TAB, LEDGER_LIST_TABS, LEDGER_PARTY_TYPE_WORD, LEDGER_SHOW, LEDGER_SHOW_OPTIONS, LEDGER_SORT, LEDGER_SORT_OPTIONS, LEDGER_TEXT, VERY_LATE_DAYS, type LedgerFocus, type LedgerListTab, type LedgerOverviewRow } from 'floman-shared/ledger';
import { PAYMENT_TYPE, PAYMENT_TYPE_LABEL } from 'floman-shared/constants';
import { formatMoney } from 'floman-shared/payments';
import { PERMISSIONS } from 'floman-shared/permissions';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { PickerField } from '@/components/PickerField';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { SheetModal } from '@/components/SheetModal';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { getLedgerOverview, type LedgerPeriod } from '@/features/ledger/api';
import { balanceColor } from '@/features/ledger/text';
import { daysAgo, formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** The oldest unpaid invoice or bill: its date, or how late (amber, red beyond VERY_LATE_DAYS). */
function OldestDue({ due }: { due: string | null }) {
  const colors = useColors();
  if (!due) return null;
  const late = daysAgo(due);
  if (late <= 0) return <Text style={[type.footnote, { color: colors.muted }]}>{late === 0 ? LEDGER_TEXT.DUE_TODAY : LEDGER_TEXT.dueOn(formatDate(due))}</Text>;
  return <Text style={[type.footnoteBold, { color: late > VERY_LATE_DAYS ? colors.danger : colors.warnText }]}>{LEDGER_TEXT.daysLate(late)}</Text>;
}

/**
 * The Ledger (Accounts): every customer and vendor with what is open to receive or pay and their balance at the end of
 * the period. Tabs All / Customers / Vendors, cards that filter (to receive, to pay, advances), Show and Sort, search.
 * Tap a party for its statement. Period: this financial year until you pick dates.
 */
export default function Ledger() {
  const router = useRouter();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const { can } = useSession();
  const { width } = useWindowDimensions();
  // Two cards fill the screen at a time (the list's side padding twice, one gap between).
  const cardWidth = (width - spacing.md * 2 - spacing.sm) / 2;

  const [period, setPeriod] = useState<LedgerPeriod>({ from: '', to: '' });
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<LedgerListTab>(LEDGER_LIST_TAB.ALL);
  const [focus, setFocus] = useState<LedgerFocus>(LEDGER_FOCUS.ALL);
  const [show, setShow] = useState<string>(LEDGER_SHOW.ALL);
  const [sort, setSort] = useState<string>(LEDGER_SORT.LATE);
  const [sheet, setSheet] = useState(false);

  const query = useQuery({ queryKey: ['ledger', period], queryFn: () => getLedgerOverview(period), placeholderData: keepPreviousData });
  const data = query.data;
  const rows = useMemo(() => ledgerListRows(data?.parties ?? [], { tab, show, focus, search, sort }), [data, tab, show, focus, search, sort]);
  const totals = data?.totals;
  const filterCount = [Boolean(period.from || period.to), show !== LEDGER_SHOW.ALL, sort !== LEDGER_SORT.LATE].filter(Boolean).length;
  const money = (v: number) => (hide.hidden ? hide.rupees(0) : formatMoney(v));
  const pickFocus = (next: LedgerFocus) => () => setFocus(focus === next ? LEDGER_FOCUS.ALL : next);

  const cards: { key: string; label: string; value: string; hint?: string; tone?: string; onPress?: () => void; active?: boolean }[] = totals
    ? [
        { key: 'all', label: LEDGER_TEXT.ALL_PARTIES, value: String(totals.withBalance), hint: LEDGER_TEXT.WITH_A_BALANCE, onPress: pickFocus(LEDGER_FOCUS.ALL), active: focus === LEDGER_FOCUS.ALL },
        { key: 'receive', label: LEDGER_TEXT.TO_RECEIVE, value: money(totals.toReceive), hint: totals.receiveLate > 0 ? LEDGER_TEXT.late(money(totals.receiveLate)) : LEDGER_TEXT.NOTHING_LATE, onPress: pickFocus(LEDGER_FOCUS.RECEIVE), active: focus === LEDGER_FOCUS.RECEIVE },
        { key: 'pay', label: LEDGER_TEXT.TO_PAY, value: money(totals.toPay), hint: totals.payLate > 0 ? LEDGER_TEXT.late(money(totals.payLate)) : LEDGER_TEXT.NOTHING_LATE, onPress: pickFocus(LEDGER_FOCUS.PAY), active: focus === LEDGER_FOCUS.PAY },
        { key: 'advance', label: LEDGER_TEXT.ADVANCES_RECEIVED, value: money(totals.advanceReceived), hint: totals.advanceParties > 0 ? LEDGER_TEXT.advanceFrom(totals.advanceParties) : LEDGER_TEXT.NONE, onPress: pickFocus(LEDGER_FOCUS.ADVANCE), active: focus === LEDGER_FOCUS.ADVANCE },
        { key: 'net', label: LEDGER_TEXT.NET, value: hide.hidden ? hide.rupees(0) : balanceInWords(totals.net), hint: LEDGER_TEXT.AFTER_EVERYTHING, tone: balanceColor(totals.net, colors) },
      ]
    : [];

  const header = (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>Accounts</Text>
      <ScreenTitle
        title="Ledger"
        right={
          <View style={styles.topActions}>
            {/* Receive and Pay: Receive always the app's green, Pay always its red; the party is picked on the form. */}
            {can(PERMISSIONS.PAYMENTS.CREATE) ? (
              <>
                <Button title={PAYMENT_TYPE_LABEL[PAYMENT_TYPE.RECEIPT]} tone="receive" style={styles.topButton} onPress={() => router.push({ pathname: '/ledger/payments/new', params: { type: PAYMENT_TYPE.RECEIPT } })} />
                <Button title={PAYMENT_TYPE_LABEL[PAYMENT_TYPE.PAYMENT]} style={styles.topButton} onPress={() => router.push({ pathname: '/ledger/payments/new', params: { type: PAYMENT_TYPE.PAYMENT } })} />
              </>
            ) : null}
            <Pressable onPress={() => void query.refetch()} accessibilityRole="button" accessibilityLabel="Refresh" style={({ pressed }) => [styles.refresh, pressed && { opacity: 0.6 }]}>
              {query.isRefetching ? <ActivityIndicator color={colors.muted} /> : <Ionicons name="refresh" size={22} color={colors.ink} />}
            </Pressable>
          </View>
        }
      />

      {cards.length ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={cards}
          keyExtractor={(c) => c.key}
          style={[styles.chips, { marginTop: spacing.md }]}
          snapToInterval={cardWidth + spacing.sm}
          decelerationRate="fast"
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}
          renderItem={({ item: c }) => (
            <Pressable onPress={c.onPress} disabled={!c.onPress} accessibilityRole={c.onPress ? 'button' : 'text'} accessibilityState={{ selected: Boolean(c.active) }} style={({ pressed }) => [styles.card, { width: cardWidth }, c.active && styles.cardActive, pressed && { opacity: 0.6 }]}>
              <Text style={styles.cardLabel}>{c.label}</Text>
              <Text style={[styles.cardValue, c.tone ? { color: c.tone } : null]}>{c.value}</Text>
              {c.hint ? <Text style={styles.cardLabel}>{c.hint}</Text> : null}
            </Pressable>
          )}
        />
      ) : null}

      <View style={[styles.searchRow, { marginTop: spacing.md }]}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={LEDGER_TEXT.SEARCH_PLACEHOLDER}
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search the ledger"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel={filterCount ? `Filters, ${filterCount} on` : 'Filters'} style={({ pressed }) => [styles.square, pressed && { opacity: 0.6 }]}>
          <Ionicons name="options-outline" size={22} color={colors.ink} />
          {filterCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{filterCount}</Text></View> : null}
        </Pressable>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={LEDGER_LIST_TABS as unknown as { value: LedgerListTab; label: string }[]}
        keyExtractor={(t) => t.value}
        style={[styles.chips, { marginTop: spacing.sm }]}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}
        renderItem={({ item }) => {
          const active = tab === item.value;
          return (
            <Pressable onPress={() => setTab(item.value)} accessibilityRole="button" accessibilityState={{ selected: active }} style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.6 }]}>
              <Text style={styles.chipText}>{item.label}</Text>
            </Pressable>
          );
        }}
      />

      {data ? <Text style={styles.metaText}>{formatDate(data.from)} to {formatDate(data.to)} · {rows.length} {rows.length === 1 ? 'party' : 'parties'}</Text> : null}
    </View>
  );

  if (query.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (query.error) {
    return (
      <Centered>
        <ErrorText message={query.error instanceof Error ? query.error.message : LEDGER_TEXT.LOAD_FAILED} />
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
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <PartyRow row={item} onOpen={() => router.push({ pathname: '/ledger/[id]', params: { id: item.id, from: data?.from ?? '', to: data?.to ?? '' } })} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{search ? LEDGER_TEXT.NO_MATCH : 'No customer or vendor with a balance in this period.'}</Text>
          </View>
        }
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.brandText} />}
      />

      <SheetModal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <KeyboardAvoidingView style={styles.sheetRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setSheet(false)} accessibilityLabel="Close" />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Filters</Text>
            <DateField label="Period from" value={period.from} onChange={(from) => setPeriod({ ...period, from })} onClear={() => setPeriod({ ...period, from: '' })} />
            <DateField label="Period to" value={period.to} onChange={(to) => setPeriod({ ...period, to })} onClear={() => setPeriod({ ...period, to: '' })} />
            <PickerField label="Show" value={show} options={LEDGER_SHOW_OPTIONS} onChange={setShow} />
            <PickerField label="Sort" value={sort} options={LEDGER_SORT_OPTIONS} onChange={setSort} />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Button title="Clear all" tone="secondary" style={{ flex: 1 }} onPress={() => { setPeriod({ from: '', to: '' }); setShow(LEDGER_SHOW.ALL); setSort(LEDGER_SORT.LATE); }} />
              <Button title="Done" style={{ flex: 1 }} onPress={() => setSheet(false)} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SheetModal>
    </>
  );
}

/** One party: its name, city, type, what is open to receive and pay, and its balance in the ledger's words. */
function PartyRow({ row, onOpen }: { row: LedgerOverviewRow; onOpen: () => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const money = (v: number) => (hide.hidden ? hide.rupees(0) : formatMoney(v));
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{hide.text(row.name)}</Text>
        <Text style={styles.small} numberOfLines={1}>{[row.city, LEDGER_PARTY_TYPE_WORD[row.type]].filter(Boolean).join(' · ')}</Text>
        <Text style={styles.small} numberOfLines={1}>
          {row.sales ? `${LEDGER_TEXT.TO_RECEIVE} ${money(row.toReceive)}` : ''}
          {row.sales && row.purchase ? ' · ' : ''}
          {row.purchase ? `${LEDGER_TEXT.TO_PAY} ${money(row.toPay)}` : ''}
        </Text>
        {row.advanceReceived > 0 ? <Text style={styles.small}>{LEDGER_TEXT.advanceAmount(money(row.advanceReceived))}</Text> : null}
        <OldestDue due={row.oldestDue} />
      </View>
      <Text style={[styles.balance, { color: balanceColor(row.balance, colors) }]}>{hide.hidden ? hide.rupees(0) : balanceInWords(row.balance)}</Text>
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    list: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg * 2 },
    header: { gap: spacing.sm, marginBottom: spacing.sm, paddingTop: spacing.md },
    eyebrow: { ...type.subhead, color: c.muted },
    topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    topButton: { minHeight: 40, paddingHorizontal: spacing.md },
    refresh: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
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
    card: { gap: 2, paddingHorizontal: spacing.md, paddingVertical: spacing.lg, borderRadius: 14, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface },
    cardActive: { borderColor: c.brandText, backgroundColor: c.brandTint },
    cardLabel: { ...type.subhead, color: c.muted },
    cardValue: { ...type.title3, color: c.ink },
    metaText: { ...type.subhead, color: c.muted },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, minHeight: 72 },
    body: { flex: 1, gap: 3 },
    name: { ...type.headline, color: c.ink },
    small: { ...type.footnote, color: c.muted },
    balance: { ...type.headline, textAlign: 'right', maxWidth: '40%' },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: c.divider },
    empty: { alignItems: 'center', paddingVertical: spacing.lg * 2 },
    emptyText: { ...type.subhead, color: c.muted, textAlign: 'center' },
    sheetRoot: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: c.surface, padding: spacing.lg, gap: spacing.md, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    sheetTitle: { ...type.title3, color: c.ink },
  });
