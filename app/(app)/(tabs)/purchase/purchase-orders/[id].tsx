import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { DEDUCTION_KIND, DEDUCTION_KIND_LABEL, DEDUCTION_TEXT, DISCOUNT_TYPE, TODAY_GROUP } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { gstinOrUnregistered } from 'floman-shared/gst';
import { PERMISSIONS } from 'floman-shared/permissions';
import { PO_STATUS } from 'floman-shared/statuses';
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
import { getPurchaseOrder } from '@/features/purchase-orders/api';
import { StatusPill } from '@/features/purchase-orders/components/StatusPill';
import { daysLate, lateText } from '@/features/purchase-orders/text';
import { listCustomFields } from '@/features/quotations/api';
import { HistoryTimeline } from '@/features/quotations/components/HistoryTimeline';
import { addressCopy, money, personName } from '@/features/quotations/text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const TAB = { ITEMS: 'items', DETAILS: 'details', LINKED: 'linked', HISTORY: 'history' } as const;
type Tab = (typeof TAB)[keyof typeof TAB];

/**
 * One Purchase Order, as the web's side panel: the total, what to do next, then Items, Details, Linked documents and
 * History. Review opens the Approve / Return screen. Edit, the ⋯ actions, Create GRN and PDF come in the next steps.
 */
export default function PurchaseOrderDetail() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const { can } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const [tab, setTab] = useState<Tab>(tabParam === TAB.HISTORY ? TAB.HISTORY : TAB.ITEMS);

  const { data: po, error, isLoading, refetch } = useQuery({ queryKey: ['purchase-order', id], queryFn: () => getPurchaseOrder(id!) });
  const fields = useQuery({ queryKey: ['custom-fields', DOCUMENT_TYPE.PURCHASE_ORDER], queryFn: () => listCustomFields(DOCUMENT_TYPE.PURCHASE_ORDER), retry: false });
  const canViewConfidential = can(PERMISSIONS.DOCUMENTS.VIEW_PRICING);

  // Back from the review screen: show what it changed.
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  if (isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (error || !po) {
    return (
      <Centered>
        <ErrorText message={error instanceof Error ? error.message : 'Purchase Order not found'} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const canApprove = can(PERMISSIONS.PURCHASE_ORDERS.APPROVE);
  const items = po.items ?? [];
  const live = items.filter((i) => Number(i.qty) > 0);
  const fullyIn = live.filter((i) => Number(i.receivedQty || 0) >= Number(i.qty)).length;
  const late = daysLate(po);
  const amount = (v: number | string | null | undefined) => (hide.hidden ? hide.rupees(0) : money(v));
  const reviewable = canApprove && (po.status === PO_STATUS.PENDING_APPROVAL || po.status === PO_STATUS.RETURNED);

  // What to do now, and what was said about it (the web's "next step" card).
  const nextStep = ((): { title: string; body: string } | null => {
    const said = (text?: string | null) => (text ? `“${text}”\n` : '');
    switch (po.status) {
      case PO_STATUS.DRAFT:
        return { title: 'Finish it and send it for approval', body: 'Open it, check the vendor and the lines, then send it.' };
      case PO_STATUS.PENDING_APPROVAL:
        return canApprove
          ? { title: 'Your decision', body: 'Review the lines and prices, then approve it or return it with a remark.' }
          : { title: 'Waiting for approval', body: 'An approver will approve it or return it with a remark.' };
      case PO_STATUS.RETURNED:
        return { title: 'Returned for changes', body: `${said(po.approvalRemarks)}${po.returnedAt ? `Returned on ${formatDate(po.returnedAt)}. ` : ''}Edit it and send it again.` };
      case PO_STATUS.APPROVED:
      case PO_STATUS.PARTIALLY_RECEIVED:
        return {
          title: late > 0 ? lateText(late) : 'Goods to receive',
          body: `${fullyIn} of ${live.length} ${live.length === 1 ? 'line' : 'lines'} received in full.${po.deliveryDueDate ? ` Due ${formatDate(po.deliveryDueDate)}.` : ''} Make a GRN when the goods come in.`,
        };
      case PO_STATUS.RECEIVED:
        return { title: 'All received', body: 'Every line came in through its GRNs.' };
      case PO_STATUS.CANCELLED:
        return { title: 'Cancelled', body: `${said(po.cancellationReason)}${po.cancelledAt ? `Cancelled on ${formatDate(po.cancelledAt)}${po.cancelledBy ? ` by ${personName(po.cancelledBy)}` : ''}.` : ''}` };
      default:
        return null;
    }
  })();

  const grns = po.grns ?? [];
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: TAB.ITEMS, label: 'Items', count: items.length },
    { key: TAB.DETAILS, label: 'Details' },
    { key: TAB.LINKED, label: 'Linked documents', count: grns.length },
    { key: TAB.HISTORY, label: 'History' },
  ];

  // The company's own fields with their saved values (a confidential one only for those who may see prices).
  const customRows = (fields.data ?? [])
    .filter((f) => !f.isConfidential || canViewConfidential)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => {
      const value = po.customFields?.[f.fieldKey];
      const text = value === undefined || value === null || value === '' ? null : f.fieldType === 'checkbox' ? (value ? 'Yes' : 'No') : String(value);
      return { key: f.fieldKey, label: f.displayLabel, text };
    })
    .filter((r) => r.text !== null);

  const bill = addressCopy(po.billTo);
  const ship = addressCopy(po.shipTo);
  // TCS the vendor adds is in the total; the TDS kept back is paid to the government, so it is less to pay.
  const tcs = Number(po.tcsAmount) > 0 ? { label: `${DEDUCTION_KIND_LABEL[DEDUCTION_KIND.TCS]} ${Number(po.tcsRate) || 0}%`, value: Number(po.tcsAmount) } : null;
  const keptBack = [
    { kind: DEDUCTION_KIND.GST_TDS, value: Number(po.gstTdsAmount) || 0, rate: Number(po.gstTdsRate) || 0 },
    { kind: DEDUCTION_KIND.TDS, value: Number(po.incomeTdsAmount) || 0, rate: Number(po.incomeTdsRate) || 0 },
  ].filter((r) => r.value > 0);
  const toPay = Number(po.grandTotal) - keptBack.reduce((sum, r) => sum + r.value, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenTitle back="Purchase Orders" />

        <View style={{ gap: spacing.xs }}>
          <Text style={styles.number} accessibilityRole="header">{po.poNumber}</Text>
          <StatusPill status={po.status} edited={Boolean(po.editedAt)} />
          <Text style={styles.sub}>
            Dated {formatDate(po.orderDate)}
            {po.deliveryDueDate ? ` · Due ${formatDate(po.deliveryDueDate)}` : ''}
            {late > 0 ? <Text style={{ color: colors.warnText }}> · {lateText(late)}</Text> : null}
          </Text>
          {po.vendor ? <Text style={styles.sub}>{hide.text(po.vendor.name)}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.totalLabel}>Grand Total</Text>
          <Text style={styles.total}>{amount(po.grandTotal)}</Text>
          <Text style={styles.sub}>{Number(po.taxAmount) === 0 ? 'No GST' : `Taxable ${amount(po.subtotal)} + GST ${amount(po.taxAmount)}`}</Text>
        </View>

        {nextStep ? (
          <View style={styles.card}>
            <Text style={styles.nextTitle}>{nextStep.title}</Text>
            {nextStep.body ? <Text style={styles.sub}>{nextStep.body}</Text> : null}
          </View>
        ) : null}

        {reviewable ? (
          <Button
            title="Review"
            onPress={() =>
              router.push({
                pathname: '/document/[kind]/[id]',
                params: { kind: DOCUMENT_TYPE.PURCHASE_ORDER, id: po.id, group: TODAY_GROUP.APPROVE, number: po.poNumber, party: po.vendor?.name ?? '', date: po.createdAt },
              })
            }
          />
        ) : null}

        {/* Items, Details, Linked documents, History */}
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
          <View style={{ gap: spacing.lg }}>
            <View style={[styles.card, { padding: 0 }]}>
              {items.map((item, i) => {
                const received = Number(item.receivedQty || 0);
                const inFull = received >= Number(item.qty) && received > 0;
                return (
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
                    <Text style={[styles.small, inFull && { color: colors.receive, fontWeight: '600' }]}>Received {received} of {Number(item.qty)}</Text>
                    {item.approverRemarks ? (
                      <View style={styles.remark}>
                        <Text style={[styles.small, { color: colors.warnText, fontWeight: '600' }]}>Approver Remark: “{item.approverRemarks}”</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {items.length === 0 ? <Text style={[styles.sub, { padding: spacing.md }]}>No items.</Text> : null}
            </View>

            <View style={styles.card}>
              <SumRow label="Taxable amount" value={amount(po.subtotal)} />
              <SumRow label="GST" value={amount(po.taxAmount)} />
              {Number(po.extraDiscount) ? <SumRow label={`Extra Discount (${Number(po.extraDiscount)}%)`} value={`-${amount(po.discountAmount)}`} /> : null}
              {tcs ? <SumRow label={tcs.label} value={amount(tcs.value)} /> : null}
              <View style={styles.sumTotal}>
                <Text style={styles.nextTitle}>Grand Total</Text>
                <Text style={styles.nextTitle}>{amount(po.grandTotal)}</Text>
              </View>
              {keptBack.map((r) => <SumRow key={r.kind} label={DEDUCTION_TEXT.lessLine(DEDUCTION_KIND_LABEL[r.kind], r.rate)} value={`-${amount(r.value)}`} />)}
              {keptBack.length ? (
                <View style={styles.sumRow}>
                  <Text style={styles.nextTitle}>{DEDUCTION_TEXT.AMOUNT_TO_PAY}</Text>
                  <Text style={styles.nextTitle}>{amount(toPay)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {tab === TAB.DETAILS ? (
          <View style={{ gap: spacing.lg }}>
            <View>
              <SectionHeader>Vendor</SectionHeader>
              <View style={[styles.card, { gap: spacing.md }]}>
                <InfoRow label="Name" value={po.vendor ? hide.text(po.vendor.name) : null} />
                <InfoRow label="GSTIN" value={po.vendor ? hide.text(gstinOrUnregistered(po.vendor.gstin)) : null} />
                <InfoRow label="Vendor address" value={bill ? hide.text(bill) : null} />
                <InfoRow label="Vendor ship to" value={ship ? hide.text(ship) : null} />
                <InfoRow label="City" value={po.vendor?.city ? hide.text(po.vendor.city) : null} />
              </View>
            </View>
            <View>
              <SectionHeader>Order</SectionHeader>
              <View style={[styles.card, { gap: spacing.md }]}>
                <InfoRow label="Payment terms" value={po.paymentTerms} />
                <InfoRow label="Delivery due" value={po.deliveryDueDate ? formatDate(po.deliveryDueDate) : null} />
                <InfoRow label="Raised by" value={po.createdBy ? `${personName(po.createdBy)} · ${formatDate(po.createdAt)}` : null} />
                <InfoRow label="Approved by" value={po.approvedBy && po.approvedAt ? `${personName(po.approvedBy)} · ${formatDate(po.approvedAt)}` : null} />
              </View>
            </View>
            {po.projectName || po.projectCode ? (
              <View>
                <SectionHeader>Project</SectionHeader>
                <View style={[styles.card, { gap: spacing.md }]}>
                  <InfoRow label="Project" value={po.projectName} />
                  <InfoRow label="Project code" value={po.projectCode} />
                  <InfoRow label="Client" value={po.clientName} />
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
            {po.notes ? (
              <View>
                <SectionHeader>Notes</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{po.notes}</Text></View>
              </View>
            ) : null}
            {po.terms ? (
              <View>
                <SectionHeader>Terms & Conditions</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{po.terms}</Text></View>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === TAB.LINKED ? (
          grns.length === 0 ? (
            <Text style={[styles.sub, { textAlign: 'center', paddingVertical: spacing.lg }]}>No goods received yet.</Text>
          ) : (
            <View style={[styles.card, { padding: 0 }]}>
              {grns.map((grn, i) => (
                <View key={grn.id} style={[styles.linked, i > 0 && styles.lineDivider]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.lineName}>{grn.grnNumber}</Text>
                    <Text style={styles.small}>
                      GRN (received){grn.grnDate ? ` · ${formatDate(grn.grnDate)}` : ''}
                      {grn.vendorInvoiceNumber ? ` · Bill ${grn.vendorInvoiceNumber}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.lineTotal}>{amount(grn.grandTotal)}</Text>
                </View>
              ))}
            </View>
          )
        ) : null}

        {tab === TAB.HISTORY ? <HistoryTimeline entries={po.auditLogs ?? []} /> : null}
      </ScrollView>
    </View>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  const styles = useThemed(makeStyles);
  return (
    <View style={styles.sumRow}>
      <Text style={styles.sub}>{label}</Text>
      <Text style={[styles.sub, { fontWeight: '600' }]}>{value}</Text>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    number: { ...type.title1, color: c.ink },
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
    remark: { backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 8, padding: spacing.sm },
    linked: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
    sumTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.outline, paddingTop: spacing.sm, marginTop: spacing.xs },
  });
