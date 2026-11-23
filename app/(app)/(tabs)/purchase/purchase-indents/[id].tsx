import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { DISCOUNT_TYPE } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { gstinOrUnregistered } from 'floman-shared/gst';
import { PERMISSIONS } from 'floman-shared/permissions';
import { PURCHASE_INDENT_STATUS } from 'floman-shared/statuses';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { SectionHeader } from '@/components/FormParts';
import { InfoRow } from '@/components/InfoRow';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { getPurchaseIndent } from '@/features/purchase-indents/api';
import { StatusPill } from '@/features/purchase-indents/components/PurchaseIndentRow';
import { daysLate, EDITABLE, poOf, sourceIndents } from '@/features/purchase-indents/text';
import { usePurchaseIndentActions } from '@/features/purchase-indents/usePurchaseIndentActions';
import { listCustomFields } from '@/features/quotations/api';
import { HistoryTimeline } from '@/features/quotations/components/HistoryTimeline';
import { addressCopy, money, personName } from '@/features/quotations/text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const TAB = { ITEMS: 'items', DETAILS: 'details', LINKED: 'linked', HISTORY: 'history' } as const;
type Tab = (typeof TAB)[keyof typeof TAB];

/**
 * One Purchase Indent, as the web's side panel: the total, what to do next, then Items, Details, Linked documents and
 * History. Review opens the Approve / Return screen (Approve makes the Purchase Order); the ⋯ menu has Edit, Duplicate
 * and Cancel.
 */
export default function PurchaseIndentDetail() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const { can } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const [tab, setTab] = useState<Tab>(tabParam === TAB.HISTORY ? TAB.HISTORY : TAB.ITEMS);
  const actions = usePurchaseIndentActions({ onHistory: () => setTab(TAB.HISTORY) });

  const { data: pr, error, isLoading, refetch } = useQuery({ queryKey: ['purchase-indent', id], queryFn: () => getPurchaseIndent(id!) });
  const fields = useQuery({ queryKey: ['custom-fields', DOCUMENT_TYPE.PURCHASE_INDENT], queryFn: () => listCustomFields(DOCUMENT_TYPE.PURCHASE_INDENT), retry: false });
  const canViewConfidential = can(PERMISSIONS.DOCUMENTS.VIEW_PRICING);

  // Back from the form or the review screen: show what changed.
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  if (isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (error || !pr) {
    return (
      <Centered>
        <ErrorText message={error instanceof Error ? error.message : 'Purchase Indent not found'} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const items = pr.items ?? [];
  const amount = (v: number | string | null | undefined) => (hide.hidden ? hide.rupees(0) : money(v));
  const late = daysLate(pr);
  const po = poOf(pr);
  const sources = sourceIndents(pr);
  const editable = can(PERMISSIONS.PURCHASE_INDENTS.CREATE) && EDITABLE.includes(pr.status);
  const reviewable = actions.approvable(pr);

  // What to do now, and what was said about it (the web's "next step" card).
  const nextStep = ((): { title: string; body: string } | null => {
    const said = (text?: string | null) => (text ? `“${text}”\n` : '');
    switch (pr.status) {
      case PURCHASE_INDENT_STATUS.DRAFT:
        return { title: 'Finish it and send it for approval', body: 'Open it, check the vendor and the lines, then send it.' };
      case PURCHASE_INDENT_STATUS.PENDING_APPROVAL:
        return can(PERMISSIONS.PURCHASE_INDENTS.APPROVE)
          ? { title: 'Your decision', body: 'Review the lines and prices, then approve it (a Purchase Order is made) or return it with a remark.' }
          : { title: 'Waiting for approval', body: 'An approver will approve it or return it with a remark.' };
      case PURCHASE_INDENT_STATUS.RETURNED:
        return { title: 'Returned for changes', body: `${said(pr.approvalRemarks)}${pr.returnedAt ? `Returned on ${formatDate(pr.returnedAt)}${pr.returnedBy ? ` by ${personName(pr.returnedBy)}` : ''}. ` : ''}Edit it and send it again.` };
      case PURCHASE_INDENT_STATUS.CONVERTED:
      case PURCHASE_INDENT_STATUS.APPROVED:
        return { title: 'Converted to a Purchase Order', body: po ? `${po.poNumber} was made when it was approved. Changes to the order are made on the PO.` : 'A Purchase Order was made when it was approved.' };
      case PURCHASE_INDENT_STATUS.CANCELLED:
        return { title: 'Cancelled', body: `${said(pr.cancellationReason)}${pr.cancelledAt ? `Cancelled on ${formatDate(pr.cancelledAt)}.` : ''}` };
      default:
        return null;
    }
  })();

  const linkedCount = (po ? 1 : 0) + sources.length;
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: TAB.ITEMS, label: 'Items', count: items.length },
    { key: TAB.DETAILS, label: 'Details' },
    { key: TAB.LINKED, label: 'Linked documents', count: linkedCount },
    { key: TAB.HISTORY, label: 'History' },
  ];

  const customRows = (fields.data ?? [])
    .filter((f) => !f.isConfidential || canViewConfidential)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => {
      const value = pr.customFields?.[f.fieldKey];
      const text = value === undefined || value === null || value === '' ? null : f.fieldType === 'checkbox' ? (value ? 'Yes' : 'No') : String(value);
      return { key: f.fieldKey, label: f.displayLabel, text };
    })
    .filter((r) => r.text !== null);

  const bill = addressCopy(pr.billTo);
  const ship = addressCopy(pr.shipTo);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenTitle back="Purchase Indents" />

        <View style={{ gap: spacing.xs }}>
          <View style={styles.numberRow}>
            <Text style={[styles.number, { flex: 1 }]} accessibilityRole="header">{pr.prNumber}</Text>
            <Pressable onPress={() => actions.open(pr)} accessibilityRole="button" accessibilityLabel="Actions" style={({ pressed }) => [styles.more, pressed && { opacity: 0.6 }]}>
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <StatusPill status={pr.status} />
          <Text style={styles.sub}>
            Dated {formatDate(pr.orderDate)}
            {pr.deliveryDueDate ? ` · Due ${formatDate(pr.deliveryDueDate)}` : ''}
            {late > 0 ? <Text style={{ color: colors.warnText }}> · {late} {late === 1 ? 'day' : 'days'} late</Text> : null}
          </Text>
          {pr.vendor ? <Text style={styles.sub}>{hide.text(pr.vendor.name)}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.totalLabel}>Grand Total</Text>
          <Text style={styles.total}>{amount(pr.grandTotal)}</Text>
          <Text style={styles.sub}>{Number(pr.taxAmount) === 0 ? 'No GST' : `Taxable ${amount(pr.subtotal)} + GST ${amount(pr.taxAmount)}`}</Text>
        </View>

        {nextStep ? (
          <View style={styles.card}>
            <Text style={styles.nextTitle}>{nextStep.title}</Text>
            {nextStep.body ? <Text style={styles.sub}>{nextStep.body}</Text> : null}
          </View>
        ) : null}

        {po ? <Button title={`Open ${po.poNumber}`} tone="secondary" onPress={() => router.push({ pathname: '/purchase/purchase-orders/[id]', params: { id: po.id } })} /> : null}
        {editable ? <Button title="Edit" tone={reviewable ? 'secondary' : 'primary'} onPress={() => router.push({ pathname: '/purchase/purchase-indents/edit', params: { id: pr.id } })} /> : null}
        {reviewable ? <Button title="Review" onPress={() => actions.review(pr)} /> : null}

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
            {items.map((item, i) => (
              <View key={item.id ?? i} style={[styles.line, i > 0 && styles.lineDivider]}>
                <View style={styles.lineTop}>
                  <Text style={styles.lineNo}>{i + 1}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.lineName}>{item.partName}</Text>
                    {item.partCode || item.hsn ? <Text style={styles.small}>{[item.partCode, item.hsn && `HSN ${item.hsn}`].filter(Boolean).join(' · ')}</Text> : null}
                    {item.partDescription || item.scopeOfWork ? <Text style={[styles.small, { fontStyle: 'italic' }]}>{item.partDescription || item.scopeOfWork}</Text> : null}
                  </View>
                  <Text style={styles.lineTotal}>{amount(item.totalAmount)}</Text>
                </View>
                <Text style={styles.small}>
                  {Number(item.qty)} {item.uom}
                  {Number(item.freeQty) > 0 ? ` (+${Number(item.freeQty)} free)` : ''} × {amount(item.unitPrice)}
                  {Number(item.discount) ? ` · Disc ${Number(item.discount)}${item.discountType === DISCOUNT_TYPE.AMOUNT ? '' : '%'}` : ''} · GST {Number(item.taxRate)}%
                </Text>
                {item.indentRef ? <Text style={styles.small}>From Indent {item.indentRef}</Text> : null}
              </View>
            ))}
            {items.length === 0 ? <Text style={[styles.sub, { padding: spacing.md }]}>No items.</Text> : null}
          </View>
        ) : null}

        {tab === TAB.DETAILS ? (
          <View style={{ gap: spacing.lg }}>
            <View>
              <SectionHeader>Vendor</SectionHeader>
              <View style={[styles.card, { gap: spacing.md }]}>
                <InfoRow label="Name" value={pr.vendor ? hide.text(pr.vendor.name) : null} />
                <InfoRow label="GSTIN" value={pr.vendor ? hide.text(gstinOrUnregistered(pr.vendor.gstin)) : null} />
                <InfoRow label="Vendor address" value={bill ? hide.text(bill) : null} />
                <InfoRow label="Vendor ship to" value={ship ? hide.text(ship) : null} />
                <InfoRow label="City" value={pr.vendor?.city ? hide.text(pr.vendor.city) : null} />
              </View>
            </View>
            <View>
              <SectionHeader>Purchase Indent</SectionHeader>
              <View style={[styles.card, { gap: spacing.md }]}>
                <InfoRow label="Payment terms" value={pr.paymentTerms ?? null} />
                <InfoRow label="Delivery due" value={pr.deliveryDueDate ? formatDate(pr.deliveryDueDate) : null} />
                <InfoRow label="Expected delivery" value={pr.expectedDeliveryDate ? formatDate(pr.expectedDeliveryDate) : null} />
                <InfoRow label="Raised by" value={pr.createdBy ? `${personName(pr.createdBy)} · ${formatDate(pr.createdAt)}` : null} />
                <InfoRow label="Approved by" value={pr.approvedBy && pr.approvedAt ? `${personName(pr.approvedBy)} · ${formatDate(pr.approvedAt)}` : null} />
              </View>
            </View>
            {pr.projectName || pr.projectCode ? (
              <View>
                <SectionHeader>Project</SectionHeader>
                <View style={[styles.card, { gap: spacing.md }]}>
                  <InfoRow label="Project" value={pr.projectName ?? null} />
                  <InfoRow label="Project code" value={pr.projectCode ?? null} />
                </View>
              </View>
            ) : null}
            {customRows.length > 0 ? (
              <View>
                <SectionHeader>Custom fields</SectionHeader>
                <View style={[styles.card, { gap: spacing.md }]}>
                  {customRows.map((r) => <InfoRow key={r.key} label={r.label} value={r.text} />)}
                </View>
              </View>
            ) : null}
            {pr.notes ? (
              <View>
                <SectionHeader>Notes</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{pr.notes}</Text></View>
              </View>
            ) : null}
            {pr.terms ? (
              <View>
                <SectionHeader>Terms & Conditions</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{pr.terms}</Text></View>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === TAB.LINKED ? (
          linkedCount === 0 ? (
            <Text style={[styles.sub, { textAlign: 'center', paddingVertical: spacing.lg }]}>Nothing linked yet.</Text>
          ) : (
            <View style={[styles.card, { padding: 0 }]}>
              {po ? (
                <Pressable onPress={() => router.push({ pathname: '/purchase/purchase-orders/[id]', params: { id: po.id } })} accessibilityRole="button" style={({ pressed }) => [styles.linked, pressed && { opacity: 0.6 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.lineName}>{po.poNumber}</Text>
                    <Text style={styles.small}>Purchase Order (made on approval)</Text>
                  </View>
                  <Text style={styles.lineTotal}>{amount(po.grandTotal)}</Text>
                </Pressable>
              ) : null}
              {sources.map((s, i) => (
                <Pressable key={s.id} onPress={() => router.push({ pathname: '/purchase/indents/[id]', params: { id: s.id } })} accessibilityRole="button" style={({ pressed }) => [styles.linked, (po || i > 0) && styles.lineDivider, pressed && { opacity: 0.6 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.lineName}>{s.indentNumber}</Text>
                    <Text style={styles.small}>Indent (its lines are ordered here)</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )
        ) : null}

        {tab === TAB.HISTORY ? <HistoryTimeline entries={pr.auditLogs ?? []} /> : null}
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
