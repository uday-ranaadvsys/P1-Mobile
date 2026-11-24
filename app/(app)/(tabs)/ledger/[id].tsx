import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LEDGER_ENTRY, LEDGER_ENTRY_LABEL, LEDGER_TDS_ENTRIES, PAYMENT_TYPE, PAYMENT_TYPE_LABEL, ledgerRows, overdueText } from 'floman-shared/constants';
import { refundTextOf } from 'floman-shared/notes';
import { gstinOrUnregistered } from 'floman-shared/gst';
import { balanceInWords, LEDGER_PARTY_TYPE_WORD, LEDGER_STATEMENT_TAB, LEDGER_STATEMENT_TABS, LEDGER_TEXT, sideAmount, sideTotal } from 'floman-shared/ledger';
import { PERMISSIONS } from 'floman-shared/permissions';
import { formatMoney } from 'floman-shared/payments';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { BusyModal } from '@/components/BusyModal';
import { Button } from '@/components/Button';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { getPartyLedger, ledgerPdfPath } from '@/features/ledger/api';
import { balanceColor, documentRoute, isPaymentLine } from '@/features/ledger/text';
import { daysAgo, formatDate } from '@/lib/format';
import { fileSafe } from '@/lib/fileName';
import { useHide } from '@/lib/privacy';
import { sharePdf } from '@/lib/sharePdf';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** Days past a due date (0 when not late), for "2 overdue, oldest 1 day late". */
const lateDays = (due: string | null) => (due ? Math.max(0, daysAgo(due)) : 0);

/**
 * One party's statement of account for the period: what is open to receive and pay, then every entry (a document, a note,
 * a payment, the TDS on it) with the Receive or Pay amount and the running balance. A document line opens that document,
 * a payment line opens the payment. Tabs: All entries, Sales side, Purchase side. Share PDF sends the printed statement.
 */
export default function PartyStatement() {
  const { id, from = '', to = '' } = useLocalSearchParams<{ id: string; from?: string; to?: string }>();
  const router = useRouter();
  const { can } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const [tab, setTab] = useState<string>(LEDGER_STATEMENT_TAB.ALL);
  const [preparing, setPreparing] = useState(false);

  const period = { from, to };
  const query = useQuery({ queryKey: ['ledger-party', id, period], queryFn: () => getPartyLedger(id!, period) });

  if (query.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  const ledger = query.data;
  if (query.error || !ledger) {
    return (
      <Centered>
        <ErrorText message={query.error instanceof Error ? query.error.message : LEDGER_TEXT.LOAD_FAILED} />
        <Button title="Try again" tone="secondary" onPress={() => void query.refetch()} />
      </Centered>
    );
  }

  const { party, open, closing } = ledger;
  const money = (v: number) => (hide.hidden ? hide.rupees(0) : formatMoney(v));
  const words = (v: number) => (hide.hidden ? hide.rupees(0) : balanceInWords(v));
  const rows = ledgerRows(ledger.lines);
  const side = tab === LEDGER_STATEMENT_TAB.ALL ? null : tab;
  const shown = side ? rows.filter((r) => r.side === side) : rows;
  const totalOf = (key: 'receive' | 'pay') => shown.reduce((sum, r) => sum + (r.line.type === LEDGER_ENTRY.BROUGHT_FORWARD ? 0 : (r[key] ?? 0)), 0);
  const canViewPayments = can(PERMISSIONS.PAYMENTS.READ);
  const canRecord = can(PERMISSIONS.PAYMENTS.CREATE);
  const record = (type: string, refund = false) => router.push({ pathname: '/ledger/payments/new', params: { type, vendorId: id!, ...(refund ? { refund: '1' } : {}) } });

  const share = async () => {
    setPreparing(true);
    try {
      await sharePdf(ledgerPdfPath(id!, { from: ledger.from, to: ledger.to }), `Ledger_${fileSafe(party.name)}.pdf`, `Ledger ${party.name}`);
    } catch (e) {
      Alert.alert('Could not share the PDF', e instanceof Error ? e.message : String(e));
    } finally {
      setPreparing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenTitle back="Ledger" />

        <View style={{ gap: spacing.xs }}>
          <Text style={styles.number} accessibilityRole="header">{hide.text(party.name)}</Text>
          <Text style={styles.sub}>{hide.text([`GSTIN ${gstinOrUnregistered(party.gstin)}`, party.city, LEDGER_PARTY_TYPE_WORD[party.type]].filter(Boolean).join(' · '))}</Text>
          <Text style={styles.sub}>Ledger · {formatDate(ledger.from)} to {formatDate(ledger.to)}</Text>
        </View>

        {/* What is open today, whatever the period, and the balance at the end of it. */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{LEDGER_TEXT.TO_RECEIVE}</Text>
          <Text style={styles.cardValue}>{money(open.toReceive)}</Text>
          <Text style={styles.small}>
            {LEDGER_TEXT.invoicesOpen(open.invoices)}
            {open.overdueInvoices > 0 ? <Text style={{ color: colors.warnText }}> · {overdueText(open.overdueInvoices, open.invoices, lateDays(open.oldestInvoiceDue))}</Text> : null}
            {open.advanceReceived > 0 ? ` · ${LEDGER_TEXT.advanceFromThem(money(open.advanceReceived))}` : ''}
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{LEDGER_TEXT.TO_PAY}</Text>
          <Text style={styles.cardValue}>{money(open.toPay)}</Text>
          <Text style={styles.small}>
            {LEDGER_TEXT.billsOpen(open.bills)}
            {open.overdueBills > 0 ? <Text style={{ color: colors.warnText }}> · {overdueText(open.overdueBills, open.bills, lateDays(open.oldestBillDue))}</Text> : null}
            {open.advancePaid > 0 ? ` · ${LEDGER_TEXT.advanceToThem(money(open.advancePaid))}` : ''}
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{LEDGER_TEXT.NET}</Text>
          <Text style={[styles.cardValue, { color: balanceColor(closing, colors) }]}>{words(closing)}</Text>
          <Text style={styles.small}>{LEDGER_TEXT.asOf(formatDate(ledger.to))}</Text>
        </View>

        {/* Receive settles their invoices and Pay their GRNs, whatever the party's saved type; a refund only while note money is left. */}
        {canRecord ? (
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Button title={PAYMENT_TYPE_LABEL[PAYMENT_TYPE.RECEIPT]} tone="receive" style={{ flex: 1 }} onPress={() => record(PAYMENT_TYPE.RECEIPT)} />
            <Button title={PAYMENT_TYPE_LABEL[PAYMENT_TYPE.PAYMENT]} style={{ flex: 1 }} onPress={() => record(PAYMENT_TYPE.PAYMENT)} />
          </View>
        ) : null}
        {canRecord && open.refundable.credit > 0 ? <Button title={`${refundTextOf(PAYMENT_TYPE.PAYMENT)?.label ?? 'Refund'} (${money(open.refundable.credit)})`} tone="secondary" onPress={() => record(PAYMENT_TYPE.PAYMENT, true)} /> : null}
        {canRecord && open.refundable.debit > 0 ? <Button title={`${refundTextOf(PAYMENT_TYPE.RECEIPT)?.label ?? 'Refund'} (${money(open.refundable.debit)})`} tone="secondary" onPress={() => record(PAYMENT_TYPE.RECEIPT, true)} /> : null}
        <Button title="Share PDF" tone="secondary" onPress={() => void share()} busy={preparing} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}>
          {LEDGER_STATEMENT_TABS.map((t) => {
            const active = tab === t.value;
            return (
              <Pressable key={t.value} onPress={() => setTab(t.value)} accessibilityRole="tab" accessibilityState={{ selected: active }} style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.6 }]}>
                <Text style={styles.chipText}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.card, { padding: 0 }]}>
          {shown.map(({ line, receive, pay }, index) => {
            const isTds = LEDGER_TDS_ENTRIES.includes(line.type);
            const isSummary = line.type === LEDGER_ENTRY.BROUGHT_FORWARD;
            const opensPayment = canViewPayments && Boolean(line.id) && isPaymentLine(line.type);
            const route = line.id ? documentRoute(line.type) : null;
            const open_ = opensPayment ? () => router.push({ pathname: '/ledger/payments/[id]', params: { id: line.id! } }) : route ? () => router.push({ pathname: route, params: { id: line.id! } }) : undefined;
            return (
              <Pressable
                key={`${line.type}-${line.id || 'none'}-${index}`}
                onPress={open_}
                disabled={!open_}
                accessibilityRole={open_ ? 'button' : undefined}
                accessibilityHint={opensPayment ? 'Opens this payment' : route ? 'Opens this document' : undefined}
                style={({ pressed }) => [styles.line, index > 0 && styles.lineDivider, isTds && { paddingLeft: spacing.lg }, pressed && { opacity: 0.6 }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.lineName, isSummary && { color: colors.muted }, isTds && { color: colors.muted, fontWeight: '400' }]}>
                    {LEDGER_ENTRY_LABEL[line.type]}
                    {!isTds && line.number ? ` · ${line.number}` : ''}
                  </Text>
                  <Text style={styles.small}>{[line.date ? formatDate(line.date) : null, line.details].filter(Boolean).join(' · ')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  {receive ? <Text style={styles.lineAmount}>{LEDGER_ENTRY_LABEL[LEDGER_ENTRY.RECEIPT]} {hide.hidden ? hide.rupees(0) : sideAmount(receive)}</Text> : null}
                  {pay ? <Text style={styles.lineAmount}>{LEDGER_ENTRY_LABEL[LEDGER_ENTRY.PAYMENT]} {hide.hidden ? hide.rupees(0) : sideAmount(pay)}</Text> : null}
                  {!side ? <Text style={[styles.small, { color: balanceColor(line.balance, colors), fontWeight: '600' }]}>{words(line.balance)}</Text> : null}
                </View>
              </Pressable>
            );
          })}
          {shown.filter((r) => r.line.type !== LEDGER_ENTRY.BROUGHT_FORWARD).length === 0 ? (
            <Text style={[styles.sub, { padding: spacing.md, textAlign: 'center' }]}>{side ? LEDGER_TEXT.NOTHING_ON_SIDE : 'Nothing was billed, noted or paid in this period.'}</Text>
          ) : null}
        </View>

        {/* The totals, as the web's last row. */}
        <View style={styles.card}>
          <View style={styles.totalRow}>
            <Text style={styles.small}>Total {LEDGER_ENTRY_LABEL[LEDGER_ENTRY.RECEIPT]}</Text>
            <Text style={styles.lineName}>{hide.hidden ? hide.rupees(0) : sideTotal(totalOf('receive'))}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.small}>Total {LEDGER_ENTRY_LABEL[LEDGER_ENTRY.PAYMENT]}</Text>
            <Text style={styles.lineName}>{hide.hidden ? hide.rupees(0) : sideTotal(totalOf('pay'))}</Text>
          </View>
          {!side ? (
            <View style={styles.totalRow}>
              <Text style={styles.small}>Balance as of {formatDate(ledger.to)}</Text>
              <Text style={[styles.lineName, { color: balanceColor(closing, colors) }]}>{words(closing)}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <BusyModal visible={preparing} text="Preparing the PDF…" />
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    number: { ...type.title1, color: c.ink },
    sub: { ...type.subhead, color: c.muted },
    small: { ...type.footnote, color: c.muted },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.xs },
    cardLabel: { ...type.footnote, color: c.muted },
    cardValue: { ...type.title3, color: c.ink },
    tabs: { marginHorizontal: -spacing.md, flexGrow: 0 },
    chip: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, justifyContent: 'center' },
    chipActive: { borderColor: c.brandText, backgroundColor: c.brandTint },
    chipText: { ...type.subhead, fontWeight: '600', color: c.ink },
    line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md },
    lineDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    lineName: { ...type.headline, color: c.ink },
    lineAmount: { ...type.subhead, fontWeight: '600', color: c.ink },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
  });
