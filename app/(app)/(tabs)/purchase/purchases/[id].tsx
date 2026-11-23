import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { billOrNone, DEDUCTION_KIND, DEDUCTION_KIND_LABEL, DEDUCTION_TEXT, DISCOUNT_TYPE, NO_VENDOR_BILL, TODAY_GROUP } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { gstinOrUnregistered } from 'floman-shared/gst';
import { PERMISSIONS } from 'floman-shared/permissions';
import { PURCHASE_STATUS, RECEIVABLE_PURCHASE_STATUSES } from 'floman-shared/statuses';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { mediaSource } from '@/api/client';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { SectionHeader } from '@/components/FormParts';
import { InfoRow } from '@/components/InfoRow';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { billFiles } from '@/features/grns/text';
import { StatusPill } from '@/features/purchase-orders/components/StatusPill';
import { getPurchase } from '@/features/purchases/api';
import { usePurchaseActions } from '@/features/purchases/usePurchaseActions';
import { listCustomFields } from '@/features/quotations/api';
import { HistoryTimeline } from '@/features/quotations/components/HistoryTimeline';
import { addressCopy, money, personName } from '@/features/quotations/text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const TAB = { ITEMS: 'items', DETAILS: 'details', LINKED: 'linked', HISTORY: 'history' } as const;
type Tab = (typeof TAB)[keyof typeof TAB];

/**
 * One Purchase, as the web's side panel: the total, what to do next, then Items, Details, Linked GRNs and History.
 * Review opens the Approve / Return screen; Receive goods starts a GRN against it; the dots menu has Edit, Duplicate,
 * Cancel and Restore.
 */
export default function PurchaseDetail() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const { can } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const [tab, setTab] = useState<Tab>(tabParam === TAB.HISTORY ? TAB.HISTORY : TAB.ITEMS);
  // The dots menu: Edit, Duplicate, Receive goods, View history (this screen's own tab), Cancel, Restore.
  const actions = usePurchaseActions({ onHistory: () => setTab(TAB.HISTORY) });

  const { data: p, error, isLoading, refetch } = useQuery({ queryKey: ['purchase', id], queryFn: () => getPurchase(id!) });
  const fields = useQuery({ queryKey: ['custom-fields', DOCUMENT_TYPE.PURCHASE], queryFn: () => listCustomFields(DOCUMENT_TYPE.PURCHASE), retry: false });
  const canViewConfidential = can(PERMISSIONS.DOCUMENTS.VIEW_PRICING);

  // Back from the review screen: show what it changed.
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  if (isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (error || !p) {
    return (
      <Centered>
        <ErrorText message={error instanceof Error ? error.message : 'Purchase not found'} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const canApprove = can(PERMISSIONS.PURCHASES.APPROVE);
  const items = p.items ?? [];
  const fullyIn = items.filter((i) => Number(i.receivedQty || 0) >= Number(i.qty)).length;
  const got = items.reduce((sum, i) => sum + Number(i.receivedQty || 0), 0);
  const ordered = items.reduce((sum, i) => sum + Number(i.qty || 0), 0);
  const amount = (v: number | string | null | undefined) => (hide.hidden ? hide.rupees(0) : money(v));
  const reviewable = canApprove && (p.status === PURCHASE_STATUS.PENDING_APPROVAL || p.status === PURCHASE_STATUS.RETURNED);
  const editable = can(PERMISSIONS.PURCHASES.UPDATE) && ([PURCHASE_STATUS.DRAFT, PURCHASE_STATUS.PENDING_APPROVAL, PURCHASE_STATUS.RETURNED] as string[]).includes(p.status);
  const receivable = can(PERMISSIONS.GRNS.CREATE) && RECEIVABLE_PURCHASE_STATUSES.includes(p.status);

  // What to do now, and what was said about it (the web's "next step" card).
  const nextStep = ((): { title: string; body: string } | null => {
    const said = (text?: string | null) => (text ? `“${text}”\n` : '');
    switch (p.status) {
      case PURCHASE_STATUS.DRAFT:
        return { title: 'Finish it and send it for approval', body: "Open it, check the lines against the vendor's bill, then send it." };
      case PURCHASE_STATUS.PENDING_APPROVAL:
        return canApprove
          ? { title: 'Your decision', body: "Check the lines against the vendor's bill, then approve it or return it with a remark." }
          : { title: 'Waiting for approval', body: 'An approver will approve it or return it with a remark.' };
      case PURCHASE_STATUS.RETURNED:
        return { title: 'Returned for changes', body: `${said(p.approvalRemarks)}${p.returnedAt ? `Returned on ${formatDate(p.returnedAt)}. ` : ''}Edit it and send it again.` };
      case PURCHASE_STATUS.APPROVED:
      case PURCHASE_STATUS.PARTIALLY_RECEIVED:
        return { title: 'Goods to receive', body: `${fullyIn} of ${items.length} ${items.length === 1 ? 'line' : 'lines'} received in full (${got} of ${ordered}). Make a GRN when the goods come in.` };
      case PURCHASE_STATUS.RECEIVED:
        return { title: 'All received', body: 'Every line came in through its GRNs.' };
      case PURCHASE_STATUS.CANCELLED:
        return { title: 'Cancelled', body: `${said(p.cancellationReason)}${p.cancelledAt ? `Cancelled on ${formatDate(p.cancelledAt)}${p.cancelledBy ? ` by ${personName(p.cancelledBy)}` : ''}. ` : ''}Any indent quantities it covered were handled as chosen then.` };
      default:
        return null;
    }
  })();

  const grns = p.grns ?? [];
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: TAB.ITEMS, label: 'Items', count: items.length },
    { key: TAB.DETAILS, label: 'Details' },
    { key: TAB.LINKED, label: 'Linked GRNs', count: grns.length },
    { key: TAB.HISTORY, label: 'History' },
  ];

  // The company's own fields with their saved values (a confidential one only for those who may see prices).
  const customRows = (fields.data ?? [])
    .filter((f) => !f.isConfidential || canViewConfidential)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => {
      const value = p.customFields?.[f.fieldKey];
      const text = value === undefined || value === null || value === '' ? null : f.fieldType === 'checkbox' ? (value ? 'Yes' : 'No') : String(value);
      return { key: f.fieldKey, label: f.displayLabel, text };
    })
    .filter((r) => r.text !== null);

  const files = billFiles({ billAttachmentUrl: p.billAttachmentUrl, attachmentPaths: p.attachmentPaths });
  const bill = addressCopy(p.billTo);
  const ship = addressCopy(p.shipTo);
  // TCS the vendor adds is in the total; the TDS kept back is paid to the government, so it is less to pay.
  const tcs = Number(p.tcsAmount) > 0 ? { label: `${DEDUCTION_KIND_LABEL[DEDUCTION_KIND.TCS]} ${Number(p.tcsRate) || 0}%`, value: Number(p.tcsAmount) } : null;
  const keptBack = [
    { kind: DEDUCTION_KIND.GST_TDS, value: Number(p.gstTdsAmount) || 0, rate: Number(p.gstTdsRate) || 0 },
    { kind: DEDUCTION_KIND.TDS, value: Number(p.incomeTdsAmount) || 0, rate: Number(p.incomeTdsRate) || 0 },
  ].filter((r) => r.value > 0);
  const toPay = Number(p.grandTotal) - keptBack.reduce((sum, r) => sum + r.value, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenTitle back="Purchases" />

        <View style={{ gap: spacing.xs }}>
          <View style={styles.numberRow}>
            <Text style={[styles.number, { flex: 1 }]} accessibilityRole="header">{p.purchaseNumber}</Text>
            <Pressable onPress={() => actions.open(p)} accessibilityRole="button" accessibilityLabel="Actions" style={({ pressed }) => [styles.more, pressed && { opacity: 0.6 }]}>
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <StatusPill status={p.status} edited={Boolean(p.editedAt)} />
          <Text style={styles.sub}>
            Dated {formatDate(p.purchaseDate)} · {p.vendorBillNumber ? `Bill No: ${p.vendorBillNumber}` : NO_VENDOR_BILL}
          </Text>
          {p.vendor ? <Text style={styles.sub}>{hide.text(p.vendor.name)}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.totalLabel}>Grand Total</Text>
          <Text style={styles.total}>{amount(p.grandTotal)}</Text>
          <Text style={styles.sub}>{Number(p.taxAmount) === 0 ? 'No GST' : `Taxable ${amount(p.subtotal)} + GST ${amount(p.taxAmount)}`}</Text>
        </View>

        {nextStep ? (
          <View style={styles.card}>
            <Text style={styles.nextTitle}>{nextStep.title}</Text>
            {nextStep.body ? <Text style={styles.sub}>{nextStep.body}</Text> : null}
          </View>
        ) : null}

        {receivable ? <Button title="Receive goods (GRN)" onPress={() => router.push({ pathname: '/purchase/grns/edit', params: { fromPurchase: p.id } })} /> : null}

        {editable ? <Button title="Edit" tone={reviewable ? 'secondary' : 'primary'} onPress={() => router.push({ pathname: '/purchase/purchases/edit', params: { id: p.id } })} /> : null}

        {reviewable ? (
          <Button
            title="Review"
            onPress={() =>
              router.push({
                pathname: '/document/[kind]/[id]',
                params: { kind: DOCUMENT_TYPE.PURCHASE, id: p.id, group: TODAY_GROUP.APPROVE, number: p.purchaseNumber, party: p.vendor?.name ?? '', date: p.createdAt ?? '' },
              })
            }
          />
        ) : null}

        {/* Items, Details, Linked GRNs, History */}
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
              <SumRow label="Taxable amount" value={amount(p.subtotal)} />
              <SumRow label="GST" value={amount(p.taxAmount)} />
              {Number(p.extraDiscount) ? <SumRow label={`Extra Discount (${Number(p.extraDiscount)}%)`} value={`-${amount(p.discountAmount)}`} /> : null}
              {tcs ? <SumRow label={tcs.label} value={amount(tcs.value)} /> : null}
              <View style={styles.sumTotal}>
                <Text style={styles.nextTitle}>Grand Total</Text>
                <Text style={styles.nextTitle}>{amount(p.grandTotal)}</Text>
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
                <InfoRow label="Name" value={p.vendor ? hide.text(p.vendor.name) : null} />
                <InfoRow label="GSTIN" value={p.vendor ? hide.text(gstinOrUnregistered(p.vendor.gstin)) : null} />
                <InfoRow label="Vendor's bill" value={`${billOrNone(p.vendorBillNumber)}${p.vendorBillDate ? ` · Dated ${formatDate(p.vendorBillDate)}` : ''}`} />
                <InfoRow label="Bill to" value={bill ? hide.text(bill) : null} />
                <InfoRow label="Ship to" value={ship ? hide.text(ship) : null} />
                <InfoRow label="City" value={p.vendor?.city ? hide.text(p.vendor.city) : null} />
              </View>
            </View>
            <View>
              <SectionHeader>Purchase</SectionHeader>
              <View style={[styles.card, { gap: spacing.md }]}>
                <InfoRow label="Purchase date" value={formatDate(p.purchaseDate)} />
                <InfoRow label="Payment terms" value={p.paymentTerms} />
                <InfoRow label="Raised by" value={p.createdBy && p.createdAt ? `${personName(p.createdBy)} · ${formatDate(p.createdAt)}` : null} />
                <InfoRow label="Approved by" value={p.approvedBy && p.approvedAt ? `${personName(p.approvedBy)} · ${formatDate(p.approvedAt)}` : null} />
              </View>
            </View>
            {p.projectName || p.projectCode ? (
              <View>
                <SectionHeader>Project</SectionHeader>
                <View style={[styles.card, { gap: spacing.md }]}>
                  <InfoRow label="Project" value={p.projectName} />
                  <InfoRow label="Project code" value={p.projectCode} />
                  <InfoRow label="Client" value={p.clientName} />
                </View>
              </View>
            ) : null}
            {files.length > 0 ? (
              <View>
                <SectionHeader>Scanned bill</SectionHeader>
                <View style={[styles.card, { gap: spacing.sm }]}>
                  {files.map((file, i) => (
                    <Pressable key={i} onPress={() => file.url && void Linking.openURL(mediaSource(file.url)?.uri ?? file.url)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
                      <Text style={[styles.body, { color: colors.brandText, textDecorationLine: 'underline' }]}>{file.name}</Text>
                    </Pressable>
                  ))}
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
            {p.notes ? (
              <View>
                <SectionHeader>Notes</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{p.notes}</Text></View>
              </View>
            ) : null}
            {p.terms ? (
              <View>
                <SectionHeader>Terms & Conditions</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{p.terms}</Text></View>
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
                <Pressable
                  key={grn.id ?? grn.grnNumber}
                  onPress={() => grn.id && router.push({ pathname: '/purchase/grns/[id]', params: { id: grn.id } })}
                  disabled={!grn.id}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.linked, i > 0 && styles.lineDivider, pressed && { opacity: 0.6 }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.lineName}>{grn.grnNumber}</Text>
                    <Text style={styles.small}>
                      GRN (received){grn.grnDate ? ` · ${formatDate(grn.grnDate)}` : ''}
                      {grn.vendorInvoiceNumber ? ` · Bill ${grn.vendorInvoiceNumber}` : ''}
                    </Text>
                  </View>
                  {grn.grandTotal !== undefined ? <Text style={styles.lineTotal}>{amount(grn.grandTotal)}</Text> : null}
                </Pressable>
              ))}
            </View>
          )
        ) : null}

        {tab === TAB.HISTORY ? <HistoryTimeline entries={p.auditLogs ?? []} /> : null}
      </ScrollView>
      {actions.sheets}
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
    remark: { backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 8, padding: spacing.sm },
    linked: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
    sumTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.outline, paddingTop: spacing.sm, marginTop: spacing.xs },
  });
