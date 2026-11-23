import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { INDENT_PRIORITY, LIST_FILTER } from 'floman-shared/constants';
import { PERMISSIONS } from 'floman-shared/permissions';
import { qtyTextAllowed } from 'floman-shared/quantity';
import { isOneUserWorkspace } from 'floman-shared/workspace';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { OptionPills, SwitchRow } from '@/components/FormParts';
import { PickerField } from '@/components/PickerField';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { SheetModal } from '@/components/SheetModal';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { giveHandoff, type PickedLine } from '@/features/indents/handoff';
import { listPendingItems, type PendingIndentItem } from '@/features/indents/pending';
import { daysLate, isPressing, lateText, priorityLabel } from '@/features/indents/text';
import { money } from '@/features/quotations/text';
import { listDepartments } from '@/features/users/api';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** The Priority filter: each priority, and the "Urgent & high" card's pair (the web's PRIORITY_OPTIONS). */
const URGENT_AND_HIGH = `${INDENT_PRIORITY.URGENT},${INDENT_PRIORITY.HIGH}`;
const PRIORITY_OPTIONS = [
  { value: LIST_FILTER.ALL, label: 'Any' },
  { value: URGENT_AND_HIGH, label: 'Urgent & high' },
  { value: INDENT_PRIORITY.URGENT, label: 'Urgent' },
  { value: INDENT_PRIORITY.HIGH, label: 'High' },
  { value: INDENT_PRIORITY.MEDIUM, label: 'Normal' },
  { value: INDENT_PRIORITY.LOW, label: 'Low' },
];

/** The two ways to see the lines. */
const VIEW = { LINES: 'LINES', BY_INDENT: 'BY_INDENT' } as const;
type View_ = (typeof VIEW)[keyof typeof VIEW];

type Picked = { item: PendingIndentItem; qty: string };
type Row = { kind: 'group'; indentId: string; indent: PendingIndentItem['indent']; items: PendingIndentItem[] } | { kind: 'line'; item: PendingIndentItem };

const partKey = (item: PendingIndentItem) => (item.partId || item.partCode || item.partName).trim().toLowerCase();
const qtyNumber = (text: string) => (Number.isFinite(parseFloat(text)) ? parseFloat(text) : 0);

/**
 * Manage Indents: the Indent lines still to order, picked with their quantities and made into a Purchase Indent, a
 * Purchase or (an Admin) a Direct Purchase Order. It has no form of its own: the document opens on its own form with
 * the picked lines in it. `search` (an Indent number) shows that Indent's lines.
 */
export default function ManageIndents() {
  const { search: linked } = useLocalSearchParams<{ search?: string }>();
  const router = useRouter();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const { can, workspace } = useSession();
  // A one-user workspace has no Purchase Indents: a Direct PO or a Purchase instead.
  const offerPurchaseIndent = !isOneUserWorkspace(workspace) && can(PERMISSIONS.PURCHASE_INDENTS.CREATE);
  const offerPurchase = can(PERMISSIONS.PURCHASES.CREATE);
  const offerDirectPo = can(PERMISSIONS.ALL);

  const [typed, setTyped] = useState(linked ?? '');
  const [search, setSearch] = useState((linked ?? '').trim());
  const [department, setDepartment] = useState<string>(LIST_FILTER.ALL);
  const [priority, setPriority] = useState<string>(LIST_FILTER.ALL);
  const [lateOnly, setLateOnly] = useState(false);
  const [view, setView] = useState<View_>(VIEW.LINES);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<Map<string, Picked>>(new Map());
  const [merge, setMerge] = useState(true);
  const [filterSheet, setFilterSheet] = useState(false);
  const [orderSheet, setOrderSheet] = useState(false);

  // Search as you type (a moment after the last key).
  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const departments = useQuery({ queryKey: ['departments'], queryFn: listDepartments, retry: false });
  const query = useQuery({
    queryKey: ['pending-indent-items', { search, department, priority, lateOnly }],
    queryFn: () =>
      listPendingItems({
        search: search || undefined,
        departmentId: department !== LIST_FILTER.ALL ? department : undefined,
        priority: priority !== LIST_FILTER.ALL ? priority : undefined,
        late: lateOnly,
      }),
    placeholderData: keepPreviousData,
  });
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const stats = query.data?.kpis;

  // A line that is no longer waiting (ordered elsewhere) drops out of the picks.
  useEffect(() => {
    if (!query.data) return;
    const ids = new Set(items.map((i) => i.id));
    setPicked((prev) => (prev.size && [...prev.keys()].some((k) => !ids.has(k)) ? new Map([...prev].filter(([k]) => ids.has(k))) : prev));
  }, [items, query.data]);

  const toggle = (item: PendingIndentItem) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, { item, qty: String(item.pendingQty) });
      return next;
    });
  const setQty = (id: string, qty: string) => setPicked((prev) => (prev.has(id) ? new Map(prev).set(id, { ...prev.get(id)!, qty }) : prev));
  const toggleGroup = (group: PendingIndentItem[]) =>
    setPicked((prev) => {
      const next = new Map(prev);
      const all = group.every((i) => next.has(i.id));
      for (const i of group) {
        if (all) next.delete(i.id);
        else next.set(i.id, { item: i, qty: String(i.pendingQty) });
      }
      return next;
    });
  const allPicked = items.length > 0 && picked.size === items.length;
  const toggleAll = () => setPicked(allPicked ? new Map() : new Map(items.map((i) => [i.id, { item: i, qty: String(i.pendingQty) }])));

  const rows: Row[] = useMemo(() => {
    if (view === VIEW.LINES) return items.map((item) => ({ kind: 'line' as const, item }));
    const groups = new Map<string, { indent: PendingIndentItem['indent']; items: PendingIndentItem[] }>();
    for (const item of items) {
      const g = groups.get(item.indentId);
      if (g) g.items.push(item);
      else groups.set(item.indentId, { indent: item.indent, items: [item] });
    }
    return [...groups].flatMap(([indentId, g]) => [{ kind: 'group' as const, indentId, indent: g.indent, items: g.items }, ...(folded[indentId] ? [] : g.items.map((item) => ({ kind: 'line' as const, item })))]);
  }, [items, view, folded]);

  // The same part picked from several lines becomes one line when merging is on.
  const duplicateParts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { item } of picked.values()) counts.set(partKey(item), (counts.get(partKey(item)) ?? 0) + 1);
    return [...counts.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0);
  }, [picked]);
  const selection = useMemo(() => {
    let value = 0;
    const indents = new Set<string>();
    for (const { item, qty } of picked.values()) {
      value += qtyNumber(qty) * (item.estimatedUnitPrice || 0);
      indents.add(item.indentId);
    }
    return { lines: picked.size, indents: indents.size, value };
  }, [picked]);

  /** The picked lines as the document's lines (the web's handleProceedToCreatePurchase); the document opens on its own form. */
  const proceed = (target: 'PR' | 'PUR' | 'PO') => {
    const chosen = [...picked.values()];
    if (chosen.length === 0) return;
    if (chosen.some(({ qty }) => !(qtyNumber(qty) > 0))) {
      Alert.alert('Quantity needed', 'Enter the quantity to order for every selected line.');
      return;
    }
    const allocation = ({ item, qty }: Picked) => ({ indentItemId: item.id, allocatedQty: Math.min(qtyNumber(qty), item.pendingQty), indentNumber: item.indent.indentNumber });
    let lines: PickedLine[];
    if (merge) {
      const groups = new Map<string, Picked[]>();
      for (const entry of chosen) groups.set(partKey(entry.item), [...(groups.get(partKey(entry.item)) ?? []), entry]);
      lines = [...groups.values()].map((entries) => {
        const first = entries[0]!.item;
        return {
          partId: first.partId,
          partName: first.partName,
          partCode: first.partCode,
          partDescription: first.partDescription,
          hsn: first.hsn,
          qty: entries.reduce((sum, e) => sum + qtyNumber(e.qty), 0),
          uom: first.uom,
          unitPrice: first.estimatedUnitPrice || 0,
          taxRate: first.taxRate ?? 0,
          scopeOfWork: entries.length > 1
            ? `Merged requirements: ${entries.map((e) => `${e.item.indent.indentNumber} (${qtyNumber(e.qty)} ${first.uom} - ${e.item.indent.department?.name || 'Dept'})`).join('; ')}`
            : first.notes || '',
          indentRef: [...new Set(entries.map((e) => e.item.indent.indentNumber))].join(', '),
          indentAllocations: entries.map(allocation),
        };
      });
    } else {
      lines = chosen.map((entry) => ({
        partId: entry.item.partId,
        partName: entry.item.partName,
        partCode: entry.item.partCode,
        partDescription: entry.item.partDescription,
        hsn: entry.item.hsn,
        qty: qtyNumber(entry.qty),
        uom: entry.item.uom,
        unitPrice: entry.item.estimatedUnitPrice || 0,
        taxRate: entry.item.taxRate ?? 0,
        scopeOfWork: entry.item.notes || '',
        indentRef: entry.item.indent.indentNumber,
        indentAllocations: [allocation(entry)],
      }));
    }
    // Where the picked lines are needed: one place for all of them and the new document starts there; a mix starts at the registered address.
    const places = new Set(chosen.map(({ item }) => item.indent.shippingLocationId ?? null));
    const [onlyPlace] = places.size === 1 ? [...places] : [null];
    giveHandoff({ lines, sourceIndentNumbers: [...new Set(chosen.map(({ item }) => item.indent.indentNumber))], neededAt: onlyPlace ?? null });
    setOrderSheet(false);
    const path = target === 'PUR' ? '/purchase/purchases/edit' : target === 'PR' ? '/purchase/purchase-indents/edit' : '/purchase/purchase-orders/edit';
    router.push({ pathname: path, params: { fromIndents: '1' } } as never);
  };

  const orderActions: SheetAction[] = [
    ...(offerPurchaseIndent ? [{ label: 'Purchase Indent', hint: 'Raise a Purchase Indent, approved before the PO', onPress: () => proceed('PR') }] : []),
    ...(offerPurchase ? [{ label: 'Purchase', hint: "Record a purchase against the vendor's bill for these items", onPress: () => proceed('PUR') }] : []),
    ...(offerDirectPo ? [{ label: 'Purchase Order', hint: 'Admin: make and issue the Purchase Order directly', onPress: () => proceed('PO') }] : []),
  ];

  const filterCount = [department !== LIST_FILTER.ALL, priority !== LIST_FILTER.ALL, lateOnly].filter(Boolean).length;
  const lines = stats?.totalPendingItems ?? 0;
  const cards: { key: string; label: string; value: string; tone?: string; onPress?: () => void; active?: boolean }[] = stats
    ? [
        { key: 'indents', label: 'Indents waiting', value: String(stats.totalPendingIndents) },
        { key: 'lines', label: 'Lines to order', value: String(lines), onPress: () => { setPriority(LIST_FILTER.ALL); setLateOnly(false); }, active: priority === LIST_FILTER.ALL && !lateOnly },
        { key: 'urgent', label: 'Urgent & high', value: String(stats.urgentItemsCount), tone: colors.warnText, onPress: () => setPriority(priority === URGENT_AND_HIGH ? LIST_FILTER.ALL : URGENT_AND_HIGH), active: priority === URGENT_AND_HIGH },
        { key: 'late', label: 'Past required-by', value: String(stats.pastRequiredByCount), tone: stats.pastRequiredByCount > 0 ? colors.warnText : undefined, onPress: () => setLateOnly(!lateOnly), active: lateOnly },
        { key: 'value', label: 'Still to buy', value: hide.hidden ? hide.rupees(0) : money(stats.totalPendingValue) },
      ]
    : [];

  const header = (
    <View style={styles.header}>
      <ScreenTitle
        back="Purchase"
        title="Manage Indents"
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
            placeholder="Search part, indent, project…"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search indent lines"
          />
          {typed ? (
            <Pressable onPress={() => setTyped('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => setFilterSheet(true)} accessibilityRole="button" accessibilityLabel={filterCount ? `Filters, ${filterCount} on` : 'Filters'} style={({ pressed }) => [styles.square, pressed && { opacity: 0.6 }]}>
          <Ionicons name="options-outline" size={22} color={colors.ink} />
          {filterCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{filterCount}</Text></View> : null}
        </Pressable>
      </View>

      {cards.length ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={cards}
          keyExtractor={(c) => c.key}
          style={styles.chips}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}
          renderItem={({ item: c }) => (
            <Pressable onPress={c.onPress} disabled={!c.onPress} accessibilityRole={c.onPress ? 'button' : 'text'} accessibilityState={{ selected: Boolean(c.active) }} style={({ pressed }) => [styles.card, c.active && styles.cardActive, pressed && { opacity: 0.6 }]}>
              <Text style={styles.cardLabel}>{c.label}</Text>
              <Text style={[styles.cardValue, c.tone ? { color: c.tone } : null]}>{c.value}</Text>
            </Pressable>
          )}
        />
      ) : null}

      <OptionPills
        label="Show lines"
        value={view}
        options={[{ value: VIEW.LINES, label: 'Lines' }, { value: VIEW.BY_INDENT, label: 'By indent' }]}
        onChange={setView}
      />

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{items.length} {items.length === 1 ? 'line' : 'lines'} to order</Text>
        {items.length > 0 ? (
          <Pressable onPress={toggleAll} accessibilityRole="button" style={styles.sort}>
            <Text style={[type.subhead, { fontWeight: '600', color: colors.brandText }]}>{allPicked ? 'Pick none' : 'Pick all'}</Text>
          </Pressable>
        ) : null}
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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(r) => (r.kind === 'group' ? `g:${r.indentId}` : r.item.id)}
        ListHeaderComponent={header}
        renderItem={({ item: row }) => {
          if (row.kind === 'group') {
            const all = row.items.every((i) => picked.has(i.id));
            const late = daysLate({ status: row.indent.status, requiredByDate: row.indent.requiredByDate });
            return (
              <View style={styles.groupRow}>
                <Pressable onPress={() => toggleGroup(row.items)} accessibilityRole="checkbox" accessibilityState={{ checked: all }} accessibilityLabel={`Pick all lines of ${row.indent.indentNumber}`} hitSlop={6}>
                  <Ionicons name={all ? 'checkbox' : 'square-outline'} size={26} color={all ? colors.brandText : colors.muted} />
                </Pressable>
                <Pressable onPress={() => router.push({ pathname: '/purchase/indents/[id]', params: { id: row.indentId } })} accessibilityRole="button" style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.lineName}>{row.indent.indentNumber}</Text>
                  <Text style={styles.small} numberOfLines={1}>
                    {[row.indent.department?.name, row.indent.projectName].filter(Boolean).join(' · ')}
                    {` · ${priorityLabel(row.indent.priority)}`}
                    {row.indent.requiredByDate ? ` · Required by ${formatDate(row.indent.requiredByDate)}` : ''}
                    {late > 0 ? ` · ${lateText(late)}` : ''}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setFolded((f) => ({ ...f, [row.indentId]: !f[row.indentId] }))} accessibilityRole="button" accessibilityLabel={folded[row.indentId] ? 'Show lines' : 'Fold lines'} hitSlop={8}>
                  <Ionicons name={folded[row.indentId] ? 'chevron-down' : 'chevron-up'} size={22} color={colors.muted} />
                </Pressable>
              </View>
            );
          }
          const { item } = row;
          const entry = picked.get(item.id);
          const late = daysLate({ status: item.indent.status, requiredByDate: item.requiredByDate });
          return (
            <View style={[styles.lineRow, entry && styles.lineRowPicked]}>
              <Pressable onPress={() => toggle(item)} accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(entry) }} accessibilityLabel={`Pick ${item.partName}`} style={styles.lineTop}>
                <Ionicons name={entry ? 'checkbox' : 'square-outline'} size={26} color={entry ? colors.brandText : colors.muted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.lineName}>{item.partName}</Text>
                  {item.partCode ? <Text style={styles.small}>{item.partCode}</Text> : null}
                  {view === VIEW.LINES ? (
                    <Text style={styles.small} numberOfLines={1}>
                      {item.indent.indentNumber}
                      {item.indent.department ? ` · ${item.indent.department.name}` : ''}
                    </Text>
                  ) : null}
                  <Text style={styles.small}>
                    <Text style={isPressing(item.indent.priority) ? { color: colors.warnText, fontWeight: '600' } : undefined}>{priorityLabel(item.indent.priority)}</Text>
                    {item.requiredByDate ? ` · Required by ${formatDate(item.requiredByDate)}` : ''}
                    {late > 0 ? <Text style={{ color: colors.warnText }}> · {lateText(late)}</Text> : null}
                  </Text>
                  {item.notes ? <Text style={[styles.small, { fontStyle: 'italic' }]}>{item.notes}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={styles.lineName}>{item.pendingQty} {item.uom}</Text>
                  <Text style={styles.small}>of {item.qty} · {hide.hidden ? hide.rupees(0) : money(item.pendingQty * item.estimatedUnitPrice)}</Text>
                </View>
              </Pressable>
              {entry ? (
                <Field label="Quantity to order" value={entry.qty} onChangeText={(v) => qtyTextAllowed(v) && setQty(item.id, v)} keyboardType="decimal-pad" suffix={item.uom} placeholder="0" />
              ) : null}
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing to order</Text>
            <Text style={styles.emptyText}>{search || filterCount ? 'No Indent lines match your current search or filters.' : 'No submitted Indent has lines waiting to be ordered.'}</Text>
          </View>
        }
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.brandText} />}
      />

      {picked.size > 0 ? (
        <View style={styles.bar}>
          {duplicateParts > 0 ? (
            <SwitchRow label="Merge the same part" help={merge ? `${duplicateParts} picked lines are the same part: merged, each part becomes one line.` : 'Every picked line stays a line of its own.'} value={merge} onChange={setMerge} />
          ) : null}
          <View style={styles.barRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineName}>{selection.lines} {selection.lines === 1 ? 'line' : 'lines'} · {selection.indents} {selection.indents === 1 ? 'indent' : 'indents'}</Text>
              <Text style={styles.small}>{hide.hidden ? hide.rupees(0) : money(selection.value)} estimated</Text>
            </View>
            {orderActions.length ? (
              <Button title="Order…" style={{ minWidth: 140 }} onPress={() => setOrderSheet(true)} />
            ) : (
              <Text style={styles.small}>You cannot create documents from these lines.</Text>
            )}
          </View>
        </View>
      ) : null}

      <ActionSheet visible={orderSheet} title="Make a document from these lines" actions={orderActions} onClose={() => setOrderSheet(false)} />

      <SheetModal visible={filterSheet} transparent animationType="slide" onRequestClose={() => setFilterSheet(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.backdrop} onPress={() => setFilterSheet(false)} accessibilityLabel="Close" />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Filters</Text>
            {(departments.data ?? []).length > 0 ? (
              <PickerField label="Department" value={department} options={[{ value: LIST_FILTER.ALL, label: 'Any' }, ...(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))]} onChange={setDepartment} />
            ) : null}
            <PickerField label="Priority" value={priority} options={PRIORITY_OPTIONS} onChange={setPriority} />
            <SwitchRow label="Past required-by only" value={lateOnly} onChange={setLateOnly} />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Button title="Clear all" tone="secondary" style={{ flex: 1 }} onPress={() => { setDepartment(LIST_FILTER.ALL); setPriority(LIST_FILTER.ALL); setLateOnly(false); }} />
              <Button title="Done" style={{ flex: 1 }} onPress={() => setFilterSheet(false)} />
            </View>
          </View>
        </View>
      </SheetModal>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    list: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg * 6 },
    header: { gap: spacing.md, marginBottom: spacing.sm },
    square: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, paddingHorizontal: spacing.md },
    searchInput: { ...type.body, flex: 1, color: c.ink, fontFamily: 'Inter_400Regular', paddingVertical: 10 },
    badge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    badgeText: { ...type.footnoteBold, color: '#FFFFFF' },
    chips: { marginHorizontal: -spacing.md, flexGrow: 0 },
    card: { minWidth: 120, gap: 2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 14, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface },
    cardActive: { borderColor: c.brandText, backgroundColor: c.brandTint },
    cardLabel: { ...type.footnote, color: c.muted },
    cardValue: { ...type.title3, color: c.ink },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
    metaText: { ...type.subhead, color: c.muted },
    sort: { minHeight: 44, justifyContent: 'center' },
    groupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, marginTop: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.outline },
    lineRow: { paddingVertical: spacing.md, gap: spacing.sm },
    lineRowPicked: { backgroundColor: c.brandTint, marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm, borderRadius: 12 },
    lineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    lineName: { ...type.headline, color: c.ink },
    small: { ...type.footnote, color: c.muted },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: c.divider },
    empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg * 2 },
    emptyTitle: { ...type.headline, color: c.ink },
    emptyText: { ...type.subhead, color: c.muted, textAlign: 'center' },
    bar: { gap: spacing.sm, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    sheetRoot: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: c.surface, padding: spacing.lg, gap: spacing.md, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    sheetTitle: { ...type.title3, color: c.ink },
  });
