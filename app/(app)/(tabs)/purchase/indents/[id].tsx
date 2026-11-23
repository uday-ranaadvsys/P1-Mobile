import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { PERMISSIONS } from 'floman-shared/permissions';
import { INDENT_ITEM_STATUS, INDENT_STATUS } from 'floman-shared/statuses';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { InfoRow } from '@/components/InfoRow';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { SectionHeader } from '@/components/FormParts';
import { useSession } from '@/features/auth/session';
import { getIndent } from '@/features/indents/api';
import { StatusPill } from '@/features/indents/components/StatusPill';
import { coveredBy, daysLate, estimatedValue, lateText, lineValue, liveLines, priorityLabel, receivedThrough, WAITING_STATUSES, WITH_REQUESTER } from '@/features/indents/text';
import { useIndentActions } from '@/features/indents/useIndentActions';
import { HistoryTimeline } from '@/features/quotations/components/HistoryTimeline';
import { money, personName } from '@/features/quotations/text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const TAB = { ITEMS: 'items', DETAILS: 'details', LINKED: 'linked', HISTORY: 'history' } as const;
type Tab = (typeof TAB)[keyof typeof TAB];

/**
 * One Indent, as the web's side panel: the estimated total, what to do next, then Items, Details, Linked documents and
 * History. The ⋯ menu has Edit, Submit, Duplicate, Order in Manage Indents, Return, Cancel and Restore.
 */
export default function IndentDetail() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const { can } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const [tab, setTab] = useState<Tab>(tabParam === TAB.HISTORY ? TAB.HISTORY : TAB.ITEMS);
  const actions = useIndentActions({ onHistory: () => setTab(TAB.HISTORY) });

  const { data: indent, error, isLoading, refetch } = useQuery({ queryKey: ['indent', id], queryFn: () => getIndent(id!) });
  // Back from the form or Manage Indents: show what changed.
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  if (isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (error || !indent) {
    return (
      <Centered>
        <ErrorText message={error instanceof Error ? error.message : 'Indent not found'} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const items = indent.items ?? [];
  const live = liveLines(items);
  const toOrder = live.filter((i) => Number(i.orderedQty || 0) < Number(i.qty)).length;
  const fullyIn = live.filter((i) => Number(i.receivedQty || 0) >= Number(i.qty)).length;
  const late = daysLate(indent);
  const amount = (v: number | string | null | undefined) => (hide.hidden ? hide.rupees(0) : money(v));
  const canOrder = can(PERMISSIONS.PURCHASE_INDENTS.CREATE) || can(PERMISSIONS.PURCHASE_ORDERS.CREATE) || can(PERMISSIONS.PURCHASES.CREATE);
  const editable = can(PERMISSIONS.INDENTS.UPDATE) && WITH_REQUESTER.includes(indent.status);
  const submittable = can(PERMISSIONS.INDENTS.CREATE) && indent.status === INDENT_STATUS.DRAFT;
  const orderable = canOrder && WAITING_STATUSES.includes(indent.status);

  // What to do now, and what was said about it (the web's "next step" card).
  const nextStep = ((): { title: string; body: string } | null => {
    const said = (text?: string | null) => (text ? `“${text}”\n` : '');
    const lateLine = late > 0 ? ` ${late} ${late === 1 ? 'day' : 'days'} past the required-by date.` : '';
    switch (indent.status) {
      case INDENT_STATUS.DRAFT:
        return { title: 'Finish it and submit it', body: 'Check the lines and the required-by date, then submit it so the purchaser can order it.' };
      case INDENT_STATUS.RETURNED:
        return { title: 'Returned for changes', body: `${said(indent.approverRemarks)}${indent.returnedAt ? `Returned on ${formatDate(indent.returnedAt)}${indent.returnedBy ? ` by ${personName(indent.returnedBy)}` : ''}. ` : ''}Edit it and submit it again.` };
      case INDENT_STATUS.SUBMITTED:
      case INDENT_STATUS.PARTIALLY_ORDERED:
        return { title: 'Waiting to be ordered', body: `${toOrder} of ${live.length} ${live.length === 1 ? 'line' : 'lines'} still to order.${lateLine} The purchaser orders them from Manage Indents.` };
      case INDENT_STATUS.ORDERED:
      case INDENT_STATUS.PARTIALLY_RECEIVED:
        return { title: 'Ordered, goods awaited', body: `${fullyIn} of ${live.length} ${live.length === 1 ? 'line' : 'lines'} received in full.${lateLine}` };
      case INDENT_STATUS.RECEIVED:
        return { title: 'All received', body: 'Every line came in through its GRNs.' };
      case INDENT_STATUS.CANCELLED:
        return { title: 'Cancelled', body: `${said(indent.cancellationReason)}${indent.cancelledAt ? `Cancelled on ${formatDate(indent.cancelledAt)}${indent.cancelledBy ? ` by ${personName(indent.cancelledBy)}` : ''}.` : ''}` };
      default:
        return null;
    }
  })();

  // One plain list: the documents that order its lines, then the GRNs that received them.
  const linked = new Map<string, { number: string; role: string; open: () => void; lines: Set<string> }>();
  for (const item of items) {
    for (const doc of coveredBy(item)) {
      const key = `${doc.route}:${doc.id}`;
      const row = linked.get(key) ?? { number: doc.number, role: doc.kind, open: () => router.push({ pathname: doc.route, params: { id: doc.id } } as never), lines: new Set<string>() };
      row.lines.add(item.id);
      linked.set(key, row);
    }
    for (const grn of receivedThrough(item)) {
      const key = `grn:${grn.id}`;
      const row = linked.get(key) ?? { number: grn.grnNumber, role: 'GRN (received)', open: () => router.push({ pathname: '/purchase/grns/[id]', params: { id: grn.id } }), lines: new Set<string>() };
      row.lines.add(item.id);
      linked.set(key, row);
    }
  }
  const linkedRows = [...linked.values()];

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: TAB.ITEMS, label: 'Items', count: items.length },
    { key: TAB.DETAILS, label: 'Details' },
    { key: TAB.LINKED, label: 'Linked documents', count: linkedRows.length },
    { key: TAB.HISTORY, label: 'History' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenTitle back="Indents" />

        <View style={{ gap: spacing.xs }}>
          <View style={styles.numberRow}>
            <Text style={[styles.number, { flex: 1 }]} accessibilityRole="header">{indent.indentNumber}</Text>
            <Pressable onPress={() => actions.open(indent)} accessibilityRole="button" accessibilityLabel="Actions" style={({ pressed }) => [styles.more, pressed && { opacity: 0.6 }]}>
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <StatusPill status={indent.status} />
          <Text style={styles.sub}>
            Raised {formatDate(indent.createdAt)}
            {indent.requiredByDate ? ` · Required by ${formatDate(indent.requiredByDate)}` : ''}
            {late > 0 ? <Text style={{ color: colors.warnText }}> · {lateText(late)}</Text> : null}
          </Text>
          {indent.department ? <Text style={styles.sub}>{indent.department.name}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.totalLabel}>Estimated total</Text>
          <Text style={styles.total}>{amount(estimatedValue(indent))}</Text>
          <Text style={styles.sub}>Estimated · {live.length} {live.length === 1 ? 'line' : 'lines'}</Text>
        </View>

        {nextStep ? (
          <View style={styles.card}>
            <Text style={styles.nextTitle}>{nextStep.title}</Text>
            {nextStep.body ? <Text style={styles.sub}>{nextStep.body}</Text> : null}
          </View>
        ) : null}

        {editable ? <Button title="Edit" tone={submittable ? 'secondary' : 'primary'} onPress={() => router.push({ pathname: '/purchase/indents/edit', params: { id: indent.id } })} /> : null}
        {submittable ? <Button title="Submit Indent" onPress={() => actions.submit(indent)} busy={actions.submitting} /> : null}
        {orderable ? <Button title="Order in Manage Indents" onPress={() => router.push({ pathname: '/purchase/manage-indents', params: { search: indent.indentNumber } })} /> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}>
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.chipText}>
                  {t.label}
                  {t.count !== undefined ? <Text style={{ color: colors.muted, fontWeight: '400' }}> {t.count}</Text> : null}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {tab === TAB.ITEMS ? (
          <View style={[styles.card, { padding: 0 }]}>
            {items.map((item, i) => {
              const cancelled = item.status === INDENT_ITEM_STATUS.CANCELLED;
              const received = Number(item.receivedQty || 0);
              return (
                <View key={item.id ?? i} style={[styles.line, i > 0 && styles.lineDivider, cancelled && { opacity: 0.5 }]}>
                  <View style={styles.lineTop}>
                    <Text style={styles.lineNo}>{i + 1}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.lineName}>{item.partName}</Text>
                      {item.partCode ? <Text style={styles.small}>{item.partCode}</Text> : null}
                      {item.notes ? <Text style={[styles.small, { fontStyle: 'italic' }]}>{item.notes}</Text> : null}
                      {cancelled ? <Text style={styles.small}>Cancelled{item.cancellationReason ? `: ${item.cancellationReason}` : ''}</Text> : null}
                    </View>
                    <Text style={styles.lineTotal}>{amount(lineValue(item))}</Text>
                  </View>
                  <Text style={styles.small}>{Number(item.qty)} {item.uom}{Number(item.estimatedUnitPrice) ? ` × ${amount(item.estimatedUnitPrice)}` : ''}</Text>
                  {cancelled ? null : (
                    <Text style={[styles.small, received >= Number(item.qty) && received > 0 && { color: colors.receive, fontWeight: '600' }]}>
                      Ordered {Number(item.orderedQty || 0)} · Received {received}
                    </Text>
                  )}
                </View>
              );
            })}
            {items.length === 0 ? <Text style={[styles.sub, { padding: spacing.md }]}>No items.</Text> : null}
          </View>
        ) : null}

        {tab === TAB.DETAILS ? (
          <View style={{ gap: spacing.lg }}>
            <View>
              <SectionHeader>Indent</SectionHeader>
              <View style={[styles.card, { gap: spacing.md }]}>
                <InfoRow label="Department" value={indent.department?.name ?? null} />
                <InfoRow label="Priority" value={priorityLabel(indent.priority)} />
                <InfoRow label="Required by" value={indent.requiredByDate ? formatDate(indent.requiredByDate) : null} />
                <InfoRow label="Reference" value={indent.reference ?? null} />
                <InfoRow label="Raised by" value={indent.createdBy ? `${personName(indent.createdBy)} · ${formatDate(indent.createdAt)}` : null} />
              </View>
            </View>
            {indent.projectName || indent.projectCode ? (
              <View>
                <SectionHeader>Project</SectionHeader>
                <View style={[styles.card, { gap: spacing.md }]}>
                  <InfoRow label="Project name" value={indent.projectName ?? null} />
                  <InfoRow label="Project code" value={indent.projectCode ?? null} />
                </View>
              </View>
            ) : null}
            {indent.notes ? (
              <View>
                <SectionHeader>Notes</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{indent.notes}</Text></View>
              </View>
            ) : null}
            {indent.termsAndConditions ? (
              <View>
                <SectionHeader>Terms & Conditions</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{indent.termsAndConditions}</Text></View>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === TAB.LINKED ? (
          linkedRows.length === 0 ? (
            <Text style={[styles.sub, { textAlign: 'center', paddingVertical: spacing.lg }]}>Nothing ordered yet.</Text>
          ) : (
            <View style={[styles.card, { padding: 0 }]}>
              {linkedRows.map((row, i) => (
                <Pressable key={`${row.role}:${row.number}`} onPress={row.open} accessibilityRole="button" style={({ pressed }) => [styles.linked, i > 0 && styles.lineDivider, pressed && { opacity: 0.6 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.lineName}>{row.number}</Text>
                    <Text style={styles.small}>{row.role}</Text>
                  </View>
                  <Text style={styles.small}>{row.lines.size} of {items.length} {items.length === 1 ? 'line' : 'lines'}</Text>
                </Pressable>
              ))}
            </View>
          )
        ) : null}

        {tab === TAB.HISTORY ? <HistoryTimeline entries={indent.auditLogs ?? []} /> : null}
      </ScrollView>
      {actions.sheets}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    number: { ...type.title1, color: c.ink },
    numberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    more: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    sub: { ...type.subhead, color: c.muted },
    body: { ...type.body, color: c.ink },
    small: { ...type.footnote, color: c.muted },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.xs },
    totalLabel: { ...type.footnote, color: c.muted },
    total: { ...type.title1, color: c.ink },
    nextTitle: { ...type.headline, color: c.ink },
    tabs: { marginHorizontal: -spacing.md, flexGrow: 0 },
    chip: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, justifyContent: 'center' },
    chipActive: { borderColor: c.brandText, backgroundColor: c.brandTint },
    chipText: { ...type.subhead, fontWeight: '600', color: c.ink },
    line: { padding: spacing.md, gap: spacing.xs },
    lineDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    lineTop: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    lineNo: { ...type.footnote, color: c.faint, width: 18 },
    lineName: { ...type.headline, color: c.ink },
    lineTotal: { ...type.headline, color: c.ink },
    linked: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  });
