import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { TODAY_GROUP } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { PERMISSIONS } from 'floman-shared/permissions';
import { CONVERTIBLE_QUOTATION_STATUSES, QUOTATION_ITEM_STATUS, QUOTATION_STATUS } from 'floman-shared/statuses';
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
import { getQuotation, listCustomFields, type Quotation } from '@/features/quotations/api';
import { HistoryTimeline } from '@/features/quotations/components/HistoryTimeline';
import { StatusPill } from '@/features/quotations/components/StatusPill';
import { addressCopy, CLOSED_STATUSES, daysLeft, money, personName, quotationDate, statusInWords } from '@/features/quotations/text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const TAB = { ITEMS: 'items', DETAILS: 'details', LINKED: 'linked', HISTORY: 'history' } as const;
type Tab = (typeof TAB)[keyof typeof TAB];

/** Approved or accepted, with lines not yet in a Sales Order. */
const canConvert = (q: Quotation) =>
  CONVERTIBLE_QUOTATION_STATUSES.includes(q.status) &&
  (!q.items || q.items.length === 0 || q.items.some((i) => Number(i.qty || 0) - Number(i.convertedQty || 0) > 0 && i.status !== QUOTATION_ITEM_STATUS.REJECTED));

/**
 * One quotation, as the web's side panel: the total, what to do next, then Items, Details, Linked documents and History.
 * Review opens the Approve / Return screen. Edit, the ⋯ actions and PDF come in the next steps.
 */
export default function QuotationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { can } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const [tab, setTab] = useState<Tab>(TAB.ITEMS);

  const { data: q, error, isLoading, refetch } = useQuery({ queryKey: ['quotation', id], queryFn: () => getQuotation(id!) });
  const fields = useQuery({ queryKey: ['custom-fields', DOCUMENT_TYPE.QUOTATION], queryFn: () => listCustomFields(DOCUMENT_TYPE.QUOTATION), retry: false });
  const canViewConfidential = can(PERMISSIONS.DOCUMENTS.VIEW_PRICING);

  // Back from the review screen: show what it changed.
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  if (isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (error || !q) {
    return (
      <Centered>
        <ErrorText message={error instanceof Error ? error.message : 'Quotation not found'} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const canApprove = can(PERMISSIONS.QUOTATIONS.APPROVE);
  const closed = CLOSED_STATUSES.includes(q.status);
  const approver = personName(q.approvedBy);
  const convertible = canConvert(q);
  const amount = (v: number | string | null | undefined) => (hide.hidden ? hide.rupees(0) : money(v));

  // What to do now, and what was said about it (the web's "next step" card).
  const nextStep = ((): { title: string; body: string } | null => {
    const said = (text?: string | null) => (text ? `“${text}”\n` : '');
    switch (q.status) {
      case QUOTATION_STATUS.DRAFT:
        return { title: 'Finish it and send it for approval', body: 'Edit it, check the items and prices, then send it.' };
      case QUOTATION_STATUS.PENDING_APPROVAL:
        return canApprove
          ? { title: 'Your decision', body: 'Check the rates, then approve it or return it with a remark.' }
          : { title: 'Waiting for approval', body: 'An approver will approve it or return it with a remark.' };
      case QUOTATION_STATUS.APPROVER_RETURNED:
        return { title: 'Returned for changes', body: `${said(q.approvalRemarks)}${approver ? `Returned by ${approver}${q.returnedAt ? ` on ${formatDate(q.returnedAt)}` : ''}. ` : ''}Edit it and send it again.` };
      case QUOTATION_STATUS.APPROVER_ACCEPTED:
        return convertible
          ? { title: 'Waiting for the customer', body: `${said(q.approvalRemarks)}${approver ? `Approved by ${approver}${q.approvedAt ? ` on ${formatDate(q.approvedAt)}` : ''}.\n` : ''}Send the PDF to the customer. When they confirm, make the Sales Order (or a Proforma Invoice).` }
          : { title: 'All done', body: 'Every line is in a Sales Order.' };
      case QUOTATION_STATUS.CUSTOMER_ACCEPTED:
      case QUOTATION_STATUS.CUSTOMER_PARTIALLY_ACCEPTED:
        return convertible
          ? { title: 'Make the Sales Order', body: "The customer's PO is in. Convert what is left into a Sales Order." }
          : { title: 'All done', body: 'Every line is in a Sales Order.' };
      case QUOTATION_STATUS.CUSTOMER_REJECTED:
        return { title: 'The customer said no', body: 'Nothing more to do. Duplicate it to quote again.' };
      case QUOTATION_STATUS.CANCELLED:
        return { title: 'Cancelled', body: `${said(q.cancellationReason)}${q.cancelledAt ? `Cancelled on ${formatDate(q.cancelledAt)}. ` : ''}It can't be changed or converted.` };
      default:
        return null;
    }
  })();

  const linked = [
    ...(q.salesOrders ?? []).map((so) => ({ id: so.id, kind: 'Sales Order', number: so.soNumber, status: so.status, total: so.grandTotal, date: so.orderDate || so.createdAt })),
    ...(q.proformaInvoices ?? []).map((pi) => ({ id: pi.id, kind: 'Proforma Invoice', number: pi.proformaNumber, status: pi.status, total: pi.grandTotal, date: pi.proformaDate })),
  ];

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: TAB.ITEMS, label: 'Items', count: q.items?.length ?? 0 },
    { key: TAB.DETAILS, label: 'Details' },
    { key: TAB.LINKED, label: 'Linked documents', count: linked.length },
    { key: TAB.HISTORY, label: 'History' },
  ];

  // The company's own fields with their saved values (a confidential one only for those who may see prices).
  const customRows = (fields.data ?? [])
    .filter((f) => !f.isConfidential || canViewConfidential)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => {
      const value = q.customFields?.[f.fieldKey];
      const text = value === undefined || value === null || value === '' ? null : f.fieldType === 'checkbox' ? (value ? 'Yes' : 'No') : String(value);
      return { key: f.fieldKey, label: f.displayLabel, text };
    })
    .filter((r) => r.text !== null);

  const bill = addressCopy(q.billTo);
  const ship = addressCopy(q.shipTo);
  const deductions = [
    Number(q.tcsAmount) > 0 && { label: `TCS (${Number(q.tcsRate) || 0}%)`, value: Number(q.tcsAmount), sign: '' },
    Number(q.gstTdsAmount) > 0 && { label: `GST TDS (${Number(q.gstTdsRate) || 0}%)`, value: Number(q.gstTdsAmount), sign: '-' },
    Number(q.incomeTdsAmount) > 0 && { label: `TDS (${Number(q.incomeTdsRate) || 0}%)`, value: Number(q.incomeTdsAmount), sign: '-' },
  ].filter(Boolean) as { label: string; value: number; sign: string }[];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenTitle back="Quotations" />

        <View style={{ gap: spacing.xs }}>
          <Text style={styles.number} accessibilityRole="header">{q.quotationNumber}</Text>
          <StatusPill status={q.status} edited={Boolean(q.editedAt)} />
          <Text style={styles.sub}>
            Dated {formatDate(quotationDate(q))}
            {q.validityDate ? ` · Valid until ${formatDate(q.validityDate)}${closed ? '' : ` · ${daysLeft(q.validityDate)}`}` : ''}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.totalLabel}>Grand Total</Text>
          <Text style={styles.total}>{amount(q.grandTotal)}</Text>
          <Text style={styles.sub}>{Number(q.taxAmount) === 0 ? 'No GST' : `Taxable ${amount(q.totalAmount)} + GST ${amount(q.taxAmount)}`}</Text>
        </View>

        {nextStep ? (
          <View style={styles.card}>
            <Text style={styles.nextTitle}>{nextStep.title}</Text>
            <Text style={styles.sub}>{nextStep.body}</Text>
          </View>
        ) : null}

        {q.status === QUOTATION_STATUS.PENDING_APPROVAL && canApprove ? (
          <Button
            title="Review"
            onPress={() =>
              router.push({
                pathname: '/document/[kind]/[id]',
                params: { kind: DOCUMENT_TYPE.QUOTATION, id: q.id, group: TODAY_GROUP.APPROVE, number: q.quotationNumber, party: q.vendor?.name ?? '', date: q.createdAt },
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
              {(q.items ?? []).map((item, i) => (
                <View key={item.id ?? i} style={[styles.line, i > 0 && styles.lineDivider]}>
                  <View style={styles.lineTop}>
                    <Text style={styles.lineNo}>{i + 1}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.lineName}>{item.partName}</Text>
                      {item.partCode ? <Text style={styles.small}>{item.partCode}</Text> : null}
                      {item.scopeOfWork ? <Text style={[styles.small, { fontStyle: 'italic' }]}>{item.scopeOfWork}</Text> : null}
                    </View>
                    <Text style={styles.lineTotal}>{amount(item.totalAmount)}</Text>
                  </View>
                  <Text style={styles.small}>
                    {Number(item.qty)} {item.uom} × {amount(item.unitPrice)}
                    {Number(item.discount) ? ` · Disc ${Number(item.discount)}${item.discountType === 'AMOUNT' ? '' : '%'}` : ''} · GST {Number(item.taxRate)}%
                  </Text>
                  {item.approverRemarks ? (
                    <View style={styles.remark}>
                      <Text style={[styles.small, { color: colors.warnText, fontWeight: '600' }]}>Approver Remark: “{item.approverRemarks}”</Text>
                    </View>
                  ) : null}
                </View>
              ))}
              {(q.items ?? []).length === 0 ? <Text style={[styles.sub, { padding: spacing.md }]}>No items.</Text> : null}
            </View>

            <View style={styles.card}>
              <SumRow label="Taxable amount" value={amount(q.totalAmount)} />
              <SumRow label="GST" value={amount(q.taxAmount)} />
              {Number(q.extraDiscount) ? <SumRow label={`Extra Discount (${Number(q.extraDiscount)}%)`} value={`-${amount(q.discountAmount)}`} /> : null}
              {deductions.map((d) => <SumRow key={d.label} label={d.label} value={`${d.sign}${amount(d.value)}`} />)}
              <View style={styles.sumTotal}>
                <Text style={styles.nextTitle}>Grand Total</Text>
                <Text style={styles.nextTitle}>{amount(q.grandTotal)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {tab === TAB.DETAILS ? (
          <View style={{ gap: spacing.lg }}>
            <View>
              <SectionHeader>Customer / Vendor</SectionHeader>
              <View style={[styles.card, { gap: spacing.md }]}>
                <InfoRow label="Name" value={q.vendor ? hide.text(q.vendor.name) : null} />
                <InfoRow label="GSTIN" value={q.vendor?.gstin ? hide.text(q.vendor.gstin) : null} />
                <InfoRow label="Bill to" value={bill ? hide.text(bill) : null} />
                <InfoRow label="Ship to" value={ship ? hide.text(ship) : null} />
                <InfoRow label="City" value={q.vendor?.city ? hide.text(q.vendor.city) : null} />
              </View>
            </View>
            <View>
              <SectionHeader>Project</SectionHeader>
              <View style={[styles.card, { gap: spacing.md }]}>
                <InfoRow label="Project" value={q.projectName} />
                <InfoRow label="Project code" value={q.projectCode} />
                <InfoRow label="Client" value={q.clientName} />
                <InfoRow label="PO number" value={q.poNumber} />
              </View>
            </View>
            {customRows.length > 0 ? (
              <View>
                <SectionHeader>Custom fields</SectionHeader>
                <View style={[styles.card, { gap: spacing.md }]}>
                  {customRows.map((r) => <InfoRow key={r.key} label={r.label} value={r.text} />)}
                </View>
              </View>
            ) : null}
            {q.notes ? (
              <View>
                <SectionHeader>Internal Notes</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{q.notes}</Text></View>
              </View>
            ) : null}
            {q.terms || q.termsAndConditions ? (
              <View>
                <SectionHeader>Terms & Conditions</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{q.terms || q.termsAndConditions}</Text></View>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === TAB.LINKED ? (
          linked.length === 0 ? (
            <Text style={[styles.sub, { textAlign: 'center', paddingVertical: spacing.lg }]}>Nothing has been made from this quotation yet.</Text>
          ) : (
            <View style={[styles.card, { padding: 0 }]}>
              {linked.map((doc, i) => (
                <View key={doc.id} style={[styles.linked, i > 0 && styles.lineDivider]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.lineName}>{doc.number}</Text>
                    <Text style={styles.small}>{doc.kind} · {formatDate(doc.date)} · {statusInWords(doc.status)}</Text>
                  </View>
                  <Text style={styles.lineTotal}>{amount(doc.total)}</Text>
                </View>
              ))}
            </View>
          )
        ) : null}

        {tab === TAB.HISTORY ? <HistoryTimeline entries={q.auditLogs ?? []} /> : null}
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
