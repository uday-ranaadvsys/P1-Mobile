import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { PAYMENT_LINK_TYPE, PAYMENT_MODE_OPTIONS, PAYMENT_TYPE, PAYMENT_TYPE_LABEL, PAYMENT_UNLINK_TEXT } from 'floman-shared/constants';
import { gstinOrUnregistered } from 'floman-shared/gst';
import { formatMoney, paymentName, personName, type PaymentAllocation, type PaymentRecord } from 'floman-shared/payments';
import { PERMISSIONS } from 'floman-shared/permissions';
import { PAYMENT_RECORD_STATUS } from 'floman-shared/statuses';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { SectionHeader } from '@/components/FormParts';
import { InfoRow } from '@/components/InfoRow';
import { ReasonSheet } from '@/components/ReasonSheet';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { cancelPayment, getPayment } from '@/features/payments/api';
import { formatDate } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const MODE_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_MODE_OPTIONS.map((o) => [o.value, o.label]));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const linkNumber = (l: PaymentAllocation) => l.invoice?.invoiceNumber || l.grn?.grnNumber || l.note?.noteNumber || (l.linkType === PAYMENT_LINK_TYPE.OPENING_BALANCE ? 'Opening balance' : '—');

const TAB = { DETAILS: 'details', LINKED: 'linked' } as const;
type Tab = (typeof TAB)[keyof typeof TAB];

/**
 * One payment (Receive or Pay), as the web's side panel: the amount and how much of it is linked or kept as advance,
 * what it means now, Details and Linked documents. Cancel payment asks for a reason; the documents it settled are due again.
 */
export default function PaymentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const [tab, setTab] = useState<Tab>(TAB.DETAILS);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: payment, error: loadError, isLoading, refetch } = useQuery({ queryKey: ['payment', id], queryFn: () => getPayment(id!) });
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  const cancel = useMutation({
    mutationFn: (reason: string) => cancelPayment(id!, reason),
    onSuccess: ({ message: said }) => {
      // What it settled is due again: the ledger, the party's statement and the documents change.
      for (const key of ['payment', 'ledger', 'ledger-party', 'grns', 'grn', 'debit-notes', 'debit-note']) void queryClient.invalidateQueries({ queryKey: [key] });
      notify(said || 'Payment cancelled.');
      setCancelling(false);
    },
    onError: (e) => setError(message(e)),
  });

  if (isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (loadError || !payment) {
    return (
      <Centered>
        <ErrorText message={loadError instanceof Error ? loadError.message : 'Payment not found'} />
        <Button title="Try again" tone="secondary" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const amount = (v: number | string | null | undefined) => (hide.hidden ? hide.rupees(0) : formatMoney(v));
  const received = payment.type === PAYMENT_TYPE.RECEIPT;
  const isCancelled = payment.status === PAYMENT_RECORD_STATUS.CANCELLED;
  const unlinked = Number(payment.unappliedAmount) || 0;
  const links = payment.allocations ?? [];
  const isRefund = links.some((l) => l.linkType === PAYMENT_LINK_TYPE.CREDIT_NOTE || l.linkType === PAYMENT_LINK_TYPE.DEBIT_NOTE);
  const partyRole = isRefund ? (received ? 'Refunded By (Vendor)' : 'Refunded To (Customer)') : received ? 'Received from' : 'Paid to';
  const canCancel = can(PERMISSIONS.PAYMENTS.DELETE) && !isCancelled;

  // What it means now: cancelled (and why), money still to link, or all linked.
  const nextStep = isCancelled
    ? { title: 'Cancelled', body: `${payment.cancellationReason ? `“${payment.cancellationReason}”\n` : ''}${payment.cancelledAt ? `Cancelled on ${formatDate(payment.cancelledAt)}${payment.cancelledBy ? ` by ${personName(payment.cancelledBy)}` : ''}. ` : ''}It no longer counts; the documents it was linked to are due again.` }
    : unlinked > 0
      ? { title: `${amount(unlinked)} advance`, body: `It is adjusted on the next ${PAYMENT_TYPE_LABEL[payment.type as keyof typeof PAYMENT_TYPE_LABEL]}.` }
      : { title: 'Fully linked', body: 'All of it settles the documents on the Linked documents tab.' };

  const open = (l: PaymentAllocation) => {
    if (l.grn) router.push({ pathname: '/purchase/grns/[id]', params: { id: l.grn.id } });
    else if (l.note && l.note.type === 'DEBIT') router.push({ pathname: '/purchase/debit-notes/[id]', params: { id: l.note.id } });
  };
  const canOpen = (l: PaymentAllocation) => Boolean(l.grn || (l.note && l.note.type === 'DEBIT'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenTitle back="Back" />

        <View style={{ gap: spacing.xs }}>
          <Text style={styles.title} accessibilityRole="header">{hide.hidden ? `${PAYMENT_TYPE_LABEL[payment.type as keyof typeof PAYMENT_TYPE_LABEL]} on ${formatDate(payment.paymentDate)}` : paymentName(payment)}</Text>
          <Text style={[styles.status, { color: isCancelled ? colors.muted : colors.receive }]}>{isCancelled ? 'Cancelled' : 'Recorded'}</Text>
          <Text style={styles.sub}>{formatDate(payment.paymentDate)} · {hide.text(payment.vendor?.name || '—')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.totalLabel}>{PAYMENT_TYPE_LABEL[payment.type as keyof typeof PAYMENT_TYPE_LABEL]}</Text>
          <Text style={styles.total}>{amount(payment.amount)}</Text>
          <Text style={styles.sub}>{amount(payment.appliedAmount)} linked · {amount(unlinked)} advance</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.nextTitle}>{nextStep.title}</Text>
          <Text style={styles.sub}>{nextStep.body}</Text>
        </View>

        {canCancel ? <Button title="Cancel payment" tone="danger" onPress={() => { setError(null); setCancelling(true); }} /> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}>
          {([[TAB.DETAILS, 'Details'], [TAB.LINKED, `Linked documents ${links.length}`]] as const).map(([key, label]) => {
            const active = tab === key;
            return (
              <Pressable key={key} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: active }} style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.6 }]}>
                <Text style={styles.chipText}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {tab === TAB.DETAILS ? (
          <View style={{ gap: spacing.lg }}>
            <View style={[styles.card, { gap: spacing.md }]}>
              <InfoRow label={partyRole} value={payment.vendor ? hide.text([payment.vendor.name, gstinOrUnregistered(payment.vendor.gstin), payment.vendor.city].filter(Boolean).join(' · ')) : null} />
              <InfoRow label="How it was paid" value={MODE_LABEL[payment.mode] || payment.mode} />
              <InfoRow label="Reference" value={payment.referenceNo ?? null} />
              <InfoRow
                label={received ? 'Received in' : 'Paid from'}
                value={payment.bankAccount ? [payment.bankAccount.bankName || payment.bankAccount.label, payment.bankAccount.accountNumber && `•••• ${String(payment.bankAccount.accountNumber).slice(-4)}`].filter(Boolean).join(' ') : null}
              />
              <InfoRow label="Company" value={payment.company?.name ?? null} />
              <InfoRow label="Recorded by" value={payment.createdBy ? personName(payment.createdBy) : null} />
              {Number(payment.tdsAmount) > 0 ? <InfoRow label="TDS" value={amount(payment.tdsAmount)} /> : null}
            </View>
            {payment.notes ? (
              <View>
                <SectionHeader>Notes</SectionHeader>
                <View style={styles.card}><Text style={styles.body}>{payment.notes}</Text></View>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === TAB.LINKED ? (
          links.length === 0 ? (
            <Text style={[styles.sub, { textAlign: 'center', paddingVertical: spacing.lg }]}>Not linked to any document: the whole amount is the party's advance.</Text>
          ) : (
            <View style={[styles.card, { padding: 0 }]}>
              {links.map((l, i) => {
                const doc = l.invoice
                  ? { date: l.invoice.invoiceDate, total: l.invoice.grandTotal, balance: l.invoice.balanceAmount, reference: null as string | null }
                  : l.grn
                    ? { date: l.grn.grnDate, total: l.grn.grandTotal, balance: l.grn.balanceAmount, reference: l.grn.vendorInvoiceNumber ?? null }
                    : l.note
                      ? { date: l.note.noteDate, total: l.note.grandTotal, balance: l.note.unappliedAmount, reference: null }
                      : null;
                return (
                  <Pressable key={l.id} onPress={() => open(l)} disabled={!canOpen(l)} accessibilityRole={canOpen(l) ? 'button' : undefined} style={({ pressed }) => [styles.link, i > 0 && styles.linkDivider, pressed && { opacity: 0.6 }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.linkName}>{linkNumber(l)}</Text>
                      {doc?.reference ? <Text style={styles.small}>Bill {doc.reference}</Text> : null}
                      <Text style={styles.small}>{[doc?.date ? formatDate(doc.date) : null, doc ? `Total ${amount(doc.total)}` : null, doc ? `Still due ${amount(doc.balance)}` : null].filter(Boolean).join(' · ')}</Text>
                      {Number(l.tdsAmount) > 0 ? <Text style={styles.small}>TDS {amount(l.tdsAmount)}</Text> : null}
                    </View>
                    <Text style={styles.linkName}>{amount(l.amount)}</Text>
                  </Pressable>
                );
              })}
            </View>
          )
        ) : null}
      </ScrollView>

      <ReasonSheet
        visible={cancelling}
        title={`Cancel ${hide.hidden ? PAYMENT_TYPE_LABEL[payment.type as keyof typeof PAYMENT_TYPE_LABEL] : paymentName(payment)}`}
        description={`${PAYMENT_UNLINK_TEXT.CANCEL_WHEN_TITLE}: ${PAYMENT_UNLINK_TEXT.CANCEL_WHEN}\n${PAYMENT_UNLINK_TEXT.CANCEL_WHAT_TITLE}: ${PAYMENT_UNLINK_TEXT.cancelWhat(formatMoney(payment.amount), [...new Set(links.map(linkNumber))])}${links.some((l) => l.invoiceId) ? `\n${PAYMENT_UNLINK_TEXT.CANCEL_INSTEAD_TITLE} ${PAYMENT_UNLINK_TEXT.CANCEL_INSTEAD}` : ''}`}
        label="Reason"
        placeholder="e.g. Wrong amount, cheque bounced, recorded twice"
        confirmText="Cancel payment"
        cancelText="Keep"
        tone="danger"
        required
        busy={cancel.isPending}
        error={error}
        onConfirm={(reason) => cancel.mutate(reason)}
        onClose={() => setCancelling(false)}
      />
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    title: { ...type.title3, color: c.ink },
    status: { ...type.footnoteBold },
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
    link: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md },
    linkDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    linkName: { ...type.headline, color: c.ink },
  });
