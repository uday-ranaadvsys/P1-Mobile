import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { billOrNone, DEDUCTION_KIND, DEDUCTION_KIND_LABEL, DEDUCTION_TEXT, DISCOUNT_TYPE, NO_VENDOR_BILL, TODAY_GROUP } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { gstinOrUnregistered } from 'floman-shared/gst';
import { PERMISSIONS } from 'floman-shared/permissions';
import { GRN_STATUS, PAYABLE_GRN_STATUSES, PAYMENT_STATUS } from 'floman-shared/statuses';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { SectionHeader } from '@/components/FormParts';
import { InfoRow } from '@/components/InfoRow';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { getGrn } from '@/features/grns/api';
import { useGrnActions } from '@/features/grns/useGrnActions';
import { StatusPill } from '@/features/grns/components/StatusPill';
import { billFiles, daysOverdue, isPayable, overdueText, STAGE_WORD } from '@/features/grns/text';
import { listCustomFields } from '@/features/quotations/api';
import { HistoryTimeline } from '@/features/quotations/components/HistoryTimeline';
import { addressCopy, money, personName } from '@/features/quotations/text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const TAB = { ITEMS: 'items', DETAILS: 'details', LINKED: 'linked', HISTORY: 'history' } as const;
type Tab = (typeof TAB)[keyof typeof TAB];

/** "PARTIALLY_PAID" → "Partially paid" (a linked document's status or a payment's mode in words). */
const inWords = (code: string) => {
  const text = code.toLowerCase().replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * One GRN, as the web's side panel: the total, what to do next, then Items, Details, Linked documents and History.
 * Review opens the Approve / Return screen; the dots menu has Edit, Duplicate, Cancel and Restore; Share PDF makes the
 * PDF and opens the phone's share sheet.
 */
export default function GrnDetail() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const { can } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const [tab, setTab] = useState<Tab>(tabParam === TAB.HISTORY ? TAB.HISTORY : TAB.ITEMS);
  // The dots menu: Edit, Duplicate, Share PDF, View history (this screen's own tab), Cancel, Restore.
  const actions = useGrnActions({ onHistory: () => setTab(TAB.HISTORY) });

  const { data: grn, error, isLoading, refetch } = useQuery({ queryKey: ['grn', id], queryFn: () => getGrn(id!) });
  const fields = useQuery({ queryKey: ['custom-fields', DOCUMENT_TYPE.GRN], queryFn: () => listCustomFields(DOCUMENT_TYPE.GRN), retry: false });
  const canViewConfidential = can(PERMISSIONS.DOCUMENTS.VIEW_PRICING);

  // Back from the review screen: show what it changed.
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  if (isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (error || !grn) {
    return (
      <Centered>
        <ErrorText message={error instanceof Error ? error.message : 'GRN not found'} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const canApprove = can(PERMISSIONS.GRNS.APPROVE);
  const items = grn.items ?? [];
  const payable = isPayable(grn);
  const late = daysOverdue(grn);
  const balance = Number(grn.balanceAmount) || 0;
  const amount = (v: number | string | null | undefined) => (hide.hidden ? hide.rupees(0) : money(v));
  const reviewable = canApprove && (grn.status === GRN_STATUS.PENDING_APPROVAL || grn.status === GRN_STATUS.RETURNED);

  // What to do now, and what was said about it (the web's "next step" card).
  const nextStep = ((): { title: string; body: string } | null => {
    const said = (text?: string | null) => (text ? `“${text}”\n` : '');
    if (payable) {
      if (grn.paymentStatus === PAYMENT_STATUS.PAID) return { title: 'Paid in full', body: 'Nothing is left to pay on this GRN.' };
      return {
        title: `${amount(balance)} ${late > 0 ? `overdue by ${late} ${late === 1 ? 'day' : 'days'}` : 'to pay'}`,
        body: `${grn.dueDate ? `Due on ${formatDate(grn.dueDate)}. ` : ''}Record the payment when you pay the vendor.`,
      };
    }
    switch (grn.status) {
      case GRN_STATUS.DRAFT:
        return { title: 'Finish it and send it for approval', body: "Open it, check the lines against the vendor's bill, then send it." };
      case GRN_STATUS.PENDING_APPROVAL:
        return canApprove
          ? { title: 'Your decision', body: 'Check the goods and the bill, then approve it or return it with a remark.' }
          : { title: 'Waiting for approval', body: 'An approver will approve it or return it with a remark.' };
      case GRN_STATUS.RETURNED:
        return { title: 'Returned for changes', body: `${said(grn.approvalRemarks)}${grn.returnedAt ? `Returned on ${formatDate(grn.returnedAt)}. ` : ''}Edit it and send it again.` };
      case GRN_STATUS.CANCELLED:
        return { title: 'Cancelled', body: `${said(grn.cancellationReason)}${grn.cancelledAt ? `Cancelled on ${formatDate(grn.cancelledAt)}${grn.cancelledBy ? ` by ${personName(grn.cancelledBy)}` : ''}. ` : ''}Its stock was taken back out.` };
      default:
        return null;
    }
  })();

  const payments = grn.paymentLinks ?? [];
  const linked = [
    ...(grn.purchaseOrder ? [{ id: grn.purchaseOrder.id, number: grn.purchaseOrder.poNumber, kind: 'Purchase Order', detail: 'received against it', total: grn.purchaseOrder.grandTotal ?? null, open: () => router.push({ pathname: '/purchase/purchase-orders/[id]', params: { id: grn.purchaseOrder!.id } }) }] : []),
    ...(grn.purchase ? [{ id: grn.purchase.id, number: grn.purchase.purchaseNumber, kind: 'Purchase', detail: 'received against it', total: grn.purchase.grandTotal ?? null, open: () => router.push({ pathname: '/purchase/purchases/[id]', params: { id: grn.purchase!.id } }) }] : []),
    ...(grn.debitNotes ?? []).map((note) => ({ id: note.id, number: note.noteNumber, kind: 'Debit Note', detail: `${formatDate(note.noteDate)} · ${inWords(note.status)}`, total: note.grandTotal as number | string | null, open: () => router.push({ pathname: '/purchase/debit-notes/[id]', params: { id: note.id } }) })),
  ];
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: TAB.ITEMS, label: 'Items', count: items.length },
    { key: TAB.DETAILS, label: 'Details' },
    { key: TAB.LINKED, label: 'Linked documents', count: linked.length + payments.length },
    { key: TAB.HISTORY, label: 'History' },
  ];

  // The company's own fields with their saved values (a confidential one only for those who may see prices).
  const customRows = (fields.data ?? [])
    .filter((f) => !f.isConfidential || canViewConfidential)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => {
      const value = grn.customFields?.[f.fieldKey];
      const text = value === undefined || value === null || value === '' ? null : f.fieldType === 'checkbox' ? (value ? 'Yes' : 'No') : String(value);
      return { key: f.fieldKey, label: f.displayLabel, text };
    })
    .filter((r) => r.text !== null);

  const files = billFiles(grn);
  const bill = addressCopy(grn.billTo);
  const ship = addressCopy(grn.shipTo);
  // TCS the vendor adds is in the total; the TDS kept back is paid to the government, so it is less to pay.
  const tcs = Number(grn.tcsAmount) > 0 ? { label: `${DEDUCTION_KIND_LABEL[DEDUCTION_KIND.TCS]} ${Number(grn.tcsRate) || 0}%`, value: Number(grn.tcsAmount) } : null;
  const keptBack = [
    { kind: DEDUCTION_KIND.GST_TDS, value: Number(grn.gstTdsAmount) || 0, rate: Number(grn.gstTdsRate) || 0 },
    { kind: DEDUCTION_KIND.TDS, value: Number(grn.incomeTdsAmount) || 0, rate: Number(grn.incomeTdsRate) || 0 },
  ].filter((r) => r.value > 0);
  const toPay = Number(grn.grandTotal) - keptBack.reduce((sum, r) => sum + r.value, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenTitle back="GRN" />

        <View style={{ gap: spacing.xs }}>
          <View style={styles.numberRow}>
            <Text style={[styles.number, { flex: 1 }]} accessibilityRole="header">{grn.grnNumber}</Text>
            <Pressable onPress={() => actions.open(grn)} accessibilityRole="button" accessibilityLabel="Actions" style={({ pressed }) => [styles.more, pressed && { opacity: 0.6 }]}>
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <View style={styles.statusRow}>
            <StatusPill grn={grn} />
            {payable && STAGE_WORD[grn.status] ? <Text style={styles.small}>{STAGE_WORD[grn.status]}</Text> : null}
          </View>
          <Text style={styles.sub}>
            Dated {formatDate(grn.grnDate)} · {grn.vendorInvoiceNumber ? `Bill No: ${grn.vendorInvoiceNumber}` : NO_VENDOR_BILL}
            {grn.dueDate ? ` · Due ${formatDate(grn.dueDate)}` : ''}
            {late > 0 ? <Text style={{ color: colors.warnText }}> · {overdueText(late)}</Text> : null}
          </Text>
          {grn.vendor ? <Text style={styles.sub}>{hide.text(grn.vendor.name)}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.totalLabel}>Grand Total</Text>
          <Text style={styles.total}>{amount(grn.grandTotal)}</Text>
          <Text style={styles.sub}>
            {payable ? `Paid ${amount(grn.paidAmount ?? 0)} · Due ${amount(balance)}` : Number(grn.taxAmount) === 0 ? 'No GST' : `Taxable ${amount(grn.subtotal)} + GST ${amount(grn.taxAmount)}`}
          </Text>
        </View>

        {nextStep ? (
          <View style={styles.card}>
            <Text style={styles.nextTitle}>{nextStep.title}</Text>
            {nextStep.body ? <Text style={styles.sub}>{nextStep.body}</Text> : null}
          </View>
        ) : null}

        <Button title="Share PDF" tone="secondary" onPress={() => void actions.share(grn)} busy={actions.sharing} />

        {/* Money still due on an approved GRN: Pay opens with this bill ticked. */}
        {can(PERMISSIONS.PAYMENTS.CREATE) && PAYABLE_GRN_STATUSES.includes(grn.status) && Number(grn.balanceAmount) > 0 && grn.vendorId ? (
          <Button title="Pay" onPress={() => router.push({ pathname: '/ledger/payments/new', params: { type: 'PAYMENT', vendorId: grn.vendorId!, documentId: grn.id } })} />
        ) : null}

        {can(PERMISSIONS.DEBIT_NOTES.CREATE) && PAYABLE_GRN_STATUSES.includes(grn.status) ? (
          <Button title="Create Debit Note" tone="secondary" onPress={() => router.push({ pathname: '/purchase/debit-notes/edit', params: { sourceId: grn.id } })} />
        ) : null}

        {can(PERMISSIONS.GRNS.UPDATE) && ([GRN_STATUS.DRAFT, GRN_STATUS.PENDING_APPROVAL, GRN_STATUS.RETURNED] as string[]).includes(grn.status) ? (
          <Button title="Edit" tone={reviewable ? 'secondary' : 'primary'} onPress={() => router.push({ pathname: '/purchase/grns/edit', params: { id: grn.id } })} />
        ) : null}

        {reviewable ? (
          <Button
            title="Review"
            onPress={() =>
              router.push({
                pathname: '/document/[kind]/[id]',
                params: { kind: DOCUMENT_TYPE.GRN, id: grn.id, group: TODAY_GROUP.APPROVE, number: grn.grnNumber, party: grn.vendor?.name ?? '', date: grn.createdAt },
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
              {items.map((item, i) => (
                <View key={item.id ?? i} style={[styles.line, i > 0 && styles.lineDivider]}>
                  <View style={styles.lineTop}>
                    <Text style={styles.lineNo}>{i + 1}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.lineName}>{item.partName}</Text>
                      {item.partCode || item.hsn ? <Text style={styles.small}>{[item.partCode, item.hsn && `HSN ${item.hsn}`].filter(Boolean).join(' · ')}</Text> : null}
                      {item.partDescription ? <Text style={[styles.small, { fontStyle: 'italic' }]}>{item.partDescription}</Text> : null}
                    </View>
                    <Text style={styles.lineTotal}>{amount(item.totalAmount)}</Text>
                  </View>
                  <Text style={styles.small}>
                    {Number(item.qty || item.inwardQty || 0)} {item.uom}
                    {Number(item.freeQty) > 0 ? ` (+${Number(item.freeQty)} free)` : ''} × {amount(item.unitPrice)}
                    {Number(item.discount) ? ` · Disc ${Number(item.discount)}${item.discountType === DISCOUNT_TYPE.AMOUNT ? '' : '%'}` : ''} · GST {Number(item.taxRate)}%
                  </Text>
                </View>
              ))}
              {items.length === 0 ? <Text style={[styles.sub, { padding: spacing.md }]}>No items.</Text> : null}
            </View>

            <View style={styles.card}>
              <SumRow label="Taxable amount" value={amount(grn.subtotal)} />
              <SumRow label="GST" value={amount(grn.taxAmount)} />
              {Number(grn.extraDiscount) > 0 ? <SumRow label={`Extra Discount (${Number(grn.extraDiscount)}%)`} value={`-${amount(grn.discountAmount)}`} /> : null}
              {Number(grn.roundOffAmount) !== 0 && grn.roundOffAmount != null ? <SumRow label="Round off" value={Number(grn.roundOffAmount).toFixed(2)} /> : null}
              {tcs ? <SumRow label={tcs.label} value={amount(tcs.value)} /> : null}
              <View style={styles.sumTotal}>
                <Text style={styles.nextTitle}>Grand Total</Text>
                <Text style={styles.nextTitle}>{amount(grn.grandTotal)}</Text>
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
                <InfoRow label="Name" value={grn.vendor ? hide.text(grn.vendor.name) : null} />
                <InfoRow label="GSTIN" value={grn.vendor ? hide.text(gstinOrUnregistered(grn.vendor.gstin)) : null} />
                <InfoRow label="Vendor's bill" value={`${billOrNone(grn.vendorInvoiceNumber)}${grn.vendorInvoiceDate ? ` · Dated ${formatDate(grn.vendorInvoiceDate)}` : ''}`} />
                <InfoRow label="Bill to" value={bill ? hide.text(bill) : null} />
                <InfoRow label="Ship to" value={ship ? hide.text(ship) : null} />
                <InfoRow label="City" value={grn.vendor?.city ? hide.text(grn.vendor.city) : null} />
              </View>
            </View>
            <View>
              <SectionHeader>GRN</SectionHeader>
              <View style={[styles.card, { gap: spacing.md }]}>
                <InfoRow label="Inward date" value={formatDate(grn.grnDate)} />
                <InfoRow label="Payment terms" value={grn.paymentTerms} />
                <InfoRow label="Raised by" value={grn.createdBy ? `${personName(grn.createdBy)} · ${formatDate(grn.createdAt)}` : null} />
                <InfoRow label="Approved by" value={grn.approvedBy && grn.approvedAt ? `${personName(grn.approvedBy)} · ${formatDate(grn.approvedAt)}` : null} />
              </View>
            </View>
            {grn.projectName || grn.projectCode ? (
              <View>
                <SectionHeader>Project</SectionHeader>
                <View style={[styles.card, { gap: spacing.md }]}>
                  <InfoRow label="Project" value={grn.projectName} />
                  <InfoRow label="Project code" value={grn.projectCode} />
                  <InfoRow label="Client" value={grn.clientName} />
                </View>
              </View>
            ) : null}
            {files.length > 0 ? (
              <View>
                <SectionHeader>Scanned bill</SectionHeader>
                <View style={[styles.card, { gap: spacing.sm }]}>
                  {files.map((file, i) => (
                    <Pressable key={i} onPress={() => file.url && void Linking.openURL(file.url)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
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
            {grn.notes ? (
              <View>
                <SectionHeader>Notes</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{grn.notes}</Text></View>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === TAB.LINKED ? (
          linked.length === 0 && payments.length === 0 ? (
            <Text style={[styles.sub, { textAlign: 'center', paddingVertical: spacing.lg }]}>Not made from another document, and nothing linked to it yet.</Text>
          ) : (
            <View style={{ gap: spacing.lg }}>
              {payments.length > 0 ? (
                <View>
                  <SectionHeader>Payments</SectionHeader>
                  <View style={[styles.card, { padding: 0 }]}>
                    {payments.map((link, i) => (
                      <View key={link.id} style={[styles.linked, i > 0 && styles.lineDivider]}>
                        <Text style={[styles.small, { flex: 1, color: colors.ink }]}>
                          {formatDate(link.payment.paymentDate)} · {inWords(link.payment.mode)}
                          {link.payment.status !== 'RECORDED' ? ` · ${inWords(link.payment.status)}` : ''}
                        </Text>
                        <Text style={styles.lineTotal}>{amount(link.amount)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
              {linked.length > 0 ? (
                <View style={[styles.card, { padding: 0 }]}>
                  {linked.map((doc, i) => (
                    <Pressable key={doc.id} onPress={doc.open} accessibilityRole="button" style={({ pressed }) => [styles.linked, i > 0 && styles.lineDivider, pressed && { opacity: 0.6 }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.lineName}>{doc.number}</Text>
                        <Text style={styles.small}>{doc.kind} · {doc.detail}</Text>
                      </View>
                      {doc.total !== null ? <Text style={styles.lineTotal}>{amount(doc.total)}</Text> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          )
        ) : null}

        {tab === TAB.HISTORY ? <HistoryTimeline entries={grn.auditLogs ?? []} /> : null}
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
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
    sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
    sumTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.outline, paddingTop: spacing.sm, marginTop: spacing.xs },
  });
