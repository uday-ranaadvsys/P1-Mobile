import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { DEDUCTION_KIND_LABEL, DEDUCTION_TEXT, MAX_PAYMENT_AMOUNT, PAYMENT_ADJUST_TEXT, PAYMENT_MODE, PAYMENT_MODE_OPTIONS, PAYMENT_TYPE, PAYMENT_TYPE_LABEL, type DeductionKind } from 'floman-shared/constants';
import { toPaise } from 'floman-shared/documentTotals';
import { refundTextOf } from 'floman-shared/notes';
import { autoAdjustLinks, autoLinks, formatMoney, keptBackOf, linkKey, paymentName, linkingError, linkingPayload, linkTotals, resolveLinks, tdsRemovalCandidates, type Linking, type OpenDocument } from 'floman-shared/payments';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DateField, toISODate } from '@/components/DateField';
import { Field } from '@/components/Field';
import { ErrorBanner, FormCard, OptionPills, ReadOnlyField } from '@/components/FormParts';
import { PickerField } from '@/components/PickerField';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { getCompany } from '@/features/company/api';
import { getParty } from '@/features/parties/api';
import { PartySheet } from '@/features/parties/components/PartySheet';
import { createPayment, listCredits, listOpenDocuments } from '@/features/payments/api';
import { formatDate } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useHide } from '@/lib/privacy';
import { daysAgo } from '@/lib/format';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const decimal = (text: string) => text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
const sum = (values: number[]) => toPaise(values.reduce((total, value) => total + value, 0));
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

type AdjustMode = 'AUTO' | 'MANUAL';

/** What differs between the two kinds of payment on this screen (the web's KIND). */
const KIND = {
  [PAYMENT_TYPE.RECEIPT]: { partyLabel: 'Customer', one: 'invoice', many: 'invoices', modeLabel: 'Received by', accountLabel: 'Into account', verb: 'receive', settled: 'received' },
  [PAYMENT_TYPE.PAYMENT]: { partyLabel: 'Vendor', one: 'bill', many: 'bills', modeLabel: 'Paid by', accountLabel: 'From account', verb: 'pay', settled: 'paid' },
} as const;

/**
 * Receive (money in from a customer) or Pay (money out to a vendor), the web's "Receive / Pay" form: the amount and bank
 * first, then how it is adjusted: **Auto adjust** (the default: the party's open invoices or bills, oldest first, a document
 * due exactly the amount first; what is left stays as advance) or **Manual** (tick the documents, or type what each gets).
 * The party's advance and credit are always used first; with them the amount can be 0. Opened from a document (`documentId`:
 * that one ticked, Manual) or as a refund of a note's leftover (`refund`). The server decides and refuses; this screen shows
 * the same preview from floman-shared. It counts as soon as it is saved: there is no draft and no approval.
 */
export default function RecordPayment() {
  const { type: typeParam, vendorId: presetParty, documentId, refund: refundParam } = useLocalSearchParams<{ type?: string; vendorId?: string; documentId?: string; refund?: string }>();
  const type = typeParam === PAYMENT_TYPE.PAYMENT ? PAYMENT_TYPE.PAYMENT : PAYMENT_TYPE.RECEIPT;
  const isReceipt = type === PAYMENT_TYPE.RECEIPT;
  const isPay = !isReceipt;
  const router = useRouter();
  const navigation = useNavigation() as unknown as {
    addListener: (type: 'beforeRemove', listener: (e: { preventDefault: () => void; data: { action: unknown } }) => void) => () => void;
    dispatch: (action: unknown) => void;
  };
  const queryClient = useQueryClient();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();

  const refundText = refundParam === '1' ? refundTextOf(type) : null;
  const isRefund = Boolean(refundText);
  const kind = isRefund ? { ...KIND[type], partyLabel: isReceipt ? 'Vendor' : 'Customer', one: 'note', many: 'notes' } : KIND[type];

  const [vendorId, setVendorId] = useState<string>(presetParty ?? '');
  const [pickParty, setPickParty] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [paymentDate, setPaymentDate] = useState(toISODate(new Date()));
  const [mode, setMode] = useState<string>(PAYMENT_MODE.BANK_TRANSFER);
  const [bankAccountId, setBankAccountId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [adjustMode, setAdjustMode] = useState<AdjustMode>(documentId || isRefund ? 'MANUAL' : 'AUTO');
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  // Manual: an amount typed in a row's "Pays now" box; the other ticked rows share the rest.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [tdsChoice, setTdsChoice] = useState<'REMOVE' | 'KEEP' | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  const party = useQuery({ queryKey: ['party', vendorId], queryFn: () => getParty(vendorId), enabled: Boolean(vendorId) });
  const company = useQuery({ queryKey: ['company'], queryFn: getCompany });
  const openQuery = useQuery({ queryKey: ['payment-open', type, vendorId, isRefund], queryFn: () => listOpenDocuments(type, vendorId, isRefund), enabled: Boolean(vendorId), gcTime: 0 });
  const usesCredit = !isRefund;
  const creditQuery = useQuery({ queryKey: ['payment-credits', type, vendorId], queryFn: () => listCredits(type, vendorId), enabled: Boolean(vendorId) && usesCredit, gcTime: 0 });
  const open = openQuery.data ?? [];
  const credits = usesCredit ? creditQuery.data ?? [] : [];

  const amount = toPaise(Math.max(0, Number(amountText) || 0));
  const needsBank = mode !== PAYMENT_MODE.CASH;
  const bankAccounts = (company.data?.bankAccounts ?? []).filter((b) => b.isActive);

  // The bank account follows the mode (cash needs none); only the account made the default is pre-selected.
  useEffect(() => {
    if (!needsBank) {
      if (bankAccountId) setBankAccountId('');
      return;
    }
    if (bankAccounts.some((b) => b.id === bankAccountId)) return;
    setBankAccountId(bankAccounts.find((b) => b.isDefault)?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsBank, company.data]);

  // Ticks for the documents just loaded: only the one it was opened from; a refund ticks all its notes (its amount follows them).
  const ticksFor = useRef<string | null>(null);
  useEffect(() => {
    if (!openQuery.data || ticksFor.current === `${type}|${vendorId}`) return;
    ticksFor.current = `${type}|${vendorId}`;
    setTyped({});
    const prefilled = documentId ? open.find((d) => d.id === documentId) : null;
    if (documentId && !prefilled) setBanner('Nothing is due on that document any more.');
    const next = Object.fromEntries(open.filter((d) => (documentId ? d === prefilled : isRefund)).map((d) => [linkKey(d), true]));
    setTicks(next);
    if (!isRefund) return;
    const due = sum(open.filter((d) => next[linkKey(d)]).map((d) => d.balance));
    setAmountText(due > 0 ? String(due) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openQuery.data]);

  // ── The advance and credit (used first), and what this payment adjusts (the web's logic, the shared rules) ──
  const creditTotal = usesCredit ? sum(credits.map((c) => c.amount)) : 0;
  const isAuto = adjustMode === 'AUTO' && usesCredit;
  const autoPlan = isAuto ? autoAdjustLinks(amount, creditTotal, open) : { links: [], matched: false };
  const autoOn = new Map(autoPlan.links.map((l) => [linkKey(l), l.amount]));
  const autoApplied = sum(autoPlan.links.map((l) => l.amount));

  const ticked = open.filter((d) => ticks[linkKey(d)]);
  // More than the ticked bills ask for, and some expected TDS kept back: the extra can be that TDS. Manual only.
  const extraOverDue = toPaise(amount - sum(ticked.map((d) => d.balance)));
  const typedTicked = ticked.filter((d) => typed[linkKey(d)] !== undefined);
  const removable = !isAuto && !isRefund && typedTicked.length === 0 && extraOverDue > 0 ? tdsRemovalCandidates(ticked, extraOverDue) : [];
  const removing = tdsChoice === 'REMOVE' && removable.length > 0;
  const removableKeys = new Set(removable.map(linkKey));
  // Removing it: those documents ask for their full total, so the money pays them in full.
  const raisedDue = (d: OpenDocument) => (removing && removableKeys.has(linkKey(d)) ? toPaise(d.balance + keptBackOf(d)) : d.balance);
  const typedAmount = (d: OpenDocument) => Math.max(0, Number(typed[linkKey(d)]) || 0);
  const typedTotal = sum(typedTicked.map(typedAmount));
  const shareOn = new Map(
    autoLinks(
      Math.max(0, toPaise(amount + creditTotal - typedTotal)),
      ticked.filter((d) => typed[linkKey(d)] === undefined).map((d) => ({ ...d, balance: raisedDue(d) })),
    ).map((l) => [linkKey(l), l.amount]),
  );
  const rowAmount = (d: OpenDocument) => (typed[linkKey(d)] !== undefined ? typedAmount(d) : shareOn.get(linkKey(d)) ?? 0);
  const manualLinking: Linking = {
    autoLink: false,
    rows: Object.fromEntries(ticked.map((d) => [linkKey(d), { amount: toPaise(rowAmount(d)), tdsAmount: 0 }] as const).filter(([, row]) => row.amount > 0)),
  };
  const links = isAuto ? [] : resolveLinks(manualLinking, open.map((d) => ({ ...d, balance: raisedDue(d) })), toPaise(amount + creditTotal));
  // A change of amount or ticks asks again.
  const removableKey = removable.map(linkKey).join(',');
  useEffect(() => setTdsChoice(null), [removableKey, amount]);
  const needsTdsChoice = removable.length > 0 && tdsChoice === null;
  const { applied, tds } = linkTotals(links);
  const manualOn = new Map(links.map((l) => [linkKey(l.document), l.amount]));
  const linkError = isAuto ? null : linkingError(links, toPaise(amount + creditTotal), isRefund);
  const creditUsed = toPaise(Math.min(creditTotal, isAuto && !autoPlan.matched ? autoApplied : Math.max(0, (isAuto ? autoApplied : applied) - amount)));
  const newApplied = toPaise(Math.max(0, (isAuto ? autoApplied : applied) - creditUsed));

  /** A refund's amount: what the ticked notes add up to (it is paid against them in full). */
  const amountFor = (nextTicks: Record<string, boolean>) => {
    const due = sum(open.filter((d) => nextTicks[linkKey(d)]).map((d) => d.balance));
    setAmountText(due > 0 ? String(due) : '');
  };
  const toggleTick = (d: OpenDocument) => {
    const key = linkKey(d);
    const next = { ...ticks, [key]: !ticks[key] };
    setTicks(next);
    // Unticked: its typed amount goes too.
    if (!next[key]) setTyped(({ [key]: _gone, ...rest }) => rest);
    if (isRefund) amountFor(next);
  };
  /** An amount typed in a row's "Pays now" box: it ticks the row. */
  const setRowAmount = (d: OpenDocument, value: string) => {
    const key = linkKey(d);
    setTicks((now) => ({ ...now, [key]: true }));
    setTyped((now) => ({ ...now, [key]: decimal(value) }));
  };

  // ── Leaving with something typed asks first ──
  const dirty = Boolean(amountText || referenceNo || notes || (Object.values(ticks).some(Boolean) && !documentId && !isRefund));
  const leaving = useRef(false);
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirty || leaving.current) return;
        e.preventDefault();
        Alert.alert('Leave without saving?', `This ${PAYMENT_TYPE_LABEL[type].toLowerCase()} will not be recorded.`, [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, dirty, type],
  );

  const save = useMutation({
    mutationFn: () =>
      createPayment({
        type,
        vendorId,
        companyId: company.data!.id,
        bankAccountId: amount > 0 && needsBank ? bankAccountId : null,
        paymentDate,
        amount,
        mode,
        referenceNo: referenceNo.trim() || null,
        notes: notes.trim() || null,
        refund: isRefund,
        ...(isAuto ? { autoLink: true, allocations: [] } : linkingPayload(manualLinking, links)),
        // Confirmed: these documents' expected TDS is removed (paid in full).
        removeTdsFrom: removing ? removable.map((d) => d.id) : [],
      }),
    onSuccess: ({ data, message: said }) => {
      for (const key of ['ledger', 'ledger-party', 'payment', 'grns', 'grn', 'debit-notes', 'debit-note', 'payment-open', 'payment-credits']) void queryClient.invalidateQueries({ queryKey: [key] });
      notify(data ? `${paymentName(data)} recorded.` : said);
      leaving.current = true;
      router.back();
    },
    onError: (e) => setBanner(message(e)),
  });

  const send = () => {
    setBanner(null);
    setAmountError(null);
    if (!vendorId) return setBanner(`Please select the ${kind.partyLabel.toLowerCase()}.`);
    if (!company.data) return setBanner('Could not load the company details.');
    if (amount > 0 && needsBank && !bankAccountId) return setBanner('Please select the bank account, or choose Cash.');
    if (amount > MAX_PAYMENT_AMOUNT) return setAmountError(`Amount can't be more than ${formatMoney(MAX_PAYMENT_AMOUNT)}.`);
    if (linkError) return setBanner(linkError);
    if (needsTdsChoice) return setBanner(DEDUCTION_TEXT.CHOOSE_ONE);
    if (amount <= 0 && creditUsed <= 0) return setAmountError(PAYMENT_ADJUST_TEXT.ENTER_AMOUNT);
    // Removing the expected TDS is confirmed first: it changes the document.
    if (removing) {
      Alert.alert(
        DEDUCTION_TEXT.CONFIRM_TITLE,
        [...removable.flatMap((d) => (d.keptBack ?? []).map((part) => DEDUCTION_TEXT.confirmLine(d.number, DEDUCTION_KIND_LABEL[part.kind as DeductionKind], part.rate, part.amount))), DEDUCTION_TEXT.CONFIRM_AFTER].join('\n'),
        [
          { text: DEDUCTION_TEXT.BACK, style: 'cancel' },
          { text: DEDUCTION_TEXT.CONFIRM_BUTTON, style: 'destructive', onPress: () => save.mutate() },
        ],
      );
      return;
    }
    save.mutate();
  };

  // The summary, in sentences: each document it pays, the old credit used, what is kept as advance.
  const paysNow = (d: OpenDocument) => (isAuto ? autoOn.get(linkKey(d)) ?? 0 : manualOn.get(linkKey(d)) ?? 0);
  const paying = open.filter((d) => paysNow(d) > 0);
  const shown = paying.slice(0, 4);
  const leftover = toPaise(Math.max(0, amount - newApplied));
  const summary = [
    ...shown.map((d) => (paysNow(d) >= d.balance ? PAYMENT_ADJUST_TEXT.paidInFull(d.number) : PAYMENT_ADJUST_TEXT.paidPart(d.number, formatMoney(paysNow(d))))),
    paying.length > shown.length && PAYMENT_ADJUST_TEXT.more(paying.length - shown.length),
    leftover > 0 && !isRefund && PAYMENT_ADJUST_TEXT.keptAsAdvance(formatMoney(leftover)),
  ]
    .filter(Boolean)
    .join(' · ');
  const saveLabel = isRefund ? PAYMENT_ADJUST_TEXT.SAVE_REFUND : isReceipt ? PAYMENT_ADJUST_TEXT.SAVE_RECEIPT : PAYMENT_ADJUST_TEXT.SAVE_PAYMENT;
  const title = refundText ? refundText.label : PAYMENT_TYPE_LABEL[type];
  const money = (v: number) => (hide.hidden ? hide.rupees(0) : formatMoney(v));

  if (company.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (company.error) {
    return (
      <Centered>
        <ErrorText message={message(company.error)} />
        <Button title="Try again" tone="secondary" onPress={() => void company.refetch()} />
      </Centered>
    );
  }

  const step = (n: number, text: string) => (
    <View style={styles.step}>
      <View style={[styles.stepNo, { backgroundColor: isReceipt ? colors.receive : colors.brand }]}><Text style={styles.stepNoText}>{n}</Text></View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
  const docRow = (d: OpenDocument, right: React.ReactNode, left?: React.ReactNode, dim?: boolean) => {
    const late = d.due ? daysAgo(d.due) : 0;
    return (
      <View style={[styles.docRow, dim && { opacity: 0.5 }]}>
        {left}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.docNumber} numberOfLines={1}>{d.number}</Text>
          <Text style={styles.small} numberOfLines={1}>
            {d.reference ? `Vendor bill ${d.reference}` : ''}
            {late > 0 ? <Text style={{ color: colors.warnText }}>{d.reference ? ' · ' : ''}{plural(late, 'day', 'days')} {PAYMENT_ADJUST_TEXT.OVERDUE}</Text> : null}
          </Text>
          <Text style={styles.small}>{PAYMENT_ADJUST_TEXT.COL_DUE} {money(d.balance)}</Text>
        </View>
        {right}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ScreenTitle back="Back" title={title} />
        <Text style={styles.sub}>{party.data ? hide.text(party.data.name) : isRefund ? refundText!.hint : isReceipt ? 'Money received from a customer' : 'Money paid to a vendor'}</Text>
        <ErrorBanner message={banner} />

        {/* Opened without a party (from the Ledger): pick one here. */}
        {!presetParty ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.label}>{kind.partyLabel}<Text style={{ color: colors.danger }}> *</Text></Text>
            <Pressable onPress={() => setPickParty(true)} accessibilityRole="button" accessibilityLabel={`${kind.partyLabel}: ${party.data?.name ?? 'not chosen'}`} style={({ pressed }) => [styles.box, pressed && { opacity: 0.7 }]}>
              <Text style={[styles.boxText, !party.data && { color: colors.placeholder }]} numberOfLines={1}>{party.data ? hide.text(party.data.name) : `Pick the ${kind.partyLabel.toLowerCase()}`}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.muted} />
            </Pressable>
          </View>
        ) : null}

        {/* The party's advance and credit, at the top once it is picked. */}
        {creditTotal > 0 ? (
          <View style={styles.creditBox}>
            <Text style={styles.small}>
              {PAYMENT_ADJUST_TEXT.CREDIT_AVAILABLE} <Text style={{ color: colors.receive, fontWeight: '700' }}>{money(creditTotal)}</Text>{' '}
              {isAuto && !autoPlan.matched ? PAYMENT_ADJUST_TEXT.CREDIT_USED_FIRST : PAYMENT_ADJUST_TEXT.CREDIT_USED_AFTER}
            </Text>
            <Text style={styles.small}>{PAYMENT_ADJUST_TEXT.creditExplain(kind.partyLabel.toLowerCase(), isReceipt ? 'Credit Notes' : 'Debit Notes')}</Text>
          </View>
        ) : null}

        {/* 1: who and how much */}
        {step(1, PAYMENT_ADJUST_TEXT.stepAmount(KIND[type].verb))}
        <FormCard>
          <Field
            label="Amount"
            required
            prefix="₹"
            value={amountText}
            onChangeText={(v) => { setAmountText(decimal(v)); setAmountError(null); }}
            placeholder={vendorId ? '0.00' : `Pick the ${kind.partyLabel.toLowerCase()} first`}
            keyboardType="decimal-pad"
            editable={Boolean(vendorId) && !isRefund}
            error={amountError}
          />
          <DateField label="Date" required value={paymentDate} onChange={setPaymentDate} />
          <PickerField label={kind.modeLabel} required value={mode} options={PAYMENT_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} onChange={setMode} />
          {needsBank ? (
            bankAccounts.length > 0 ? (
              <PickerField
                label={kind.accountLabel}
                required
                value={bankAccountId}
                placeholder="Choose a bank account"
                options={bankAccounts.map((b) => ({ value: b.id, label: `${b.bankName} ···${b.accountNumber.slice(-4)}${b.isDefault ? ' (Default)' : ''}` }))}
                onChange={setBankAccountId}
              />
            ) : (
              <ReadOnlyField label={kind.accountLabel} text="No bank account yet. Ask your Admin to add one, or choose Cash." empty />
            )
          ) : null}
          <Field label="Reference" value={referenceNo} onChangeText={setReferenceNo} placeholder="UTR / cheque no." maxLength={100} />
          <Pressable onPress={() => setShowMore((s) => !s)} accessibilityRole="button" accessibilityState={{ expanded: showMore }} style={styles.toggle}>
            <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={18} color={colors.ink} />
            <Text style={styles.toggleText}>More details</Text>
          </Pressable>
          {showMore ? <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Anything worth remembering about this payment (optional)" multiline maxLength={2000} autoCapitalize="sentences" /> : null}
        </FormCard>

        {/* 2: how it is adjusted */}
        {vendorId ? (
          <>
            {step(2, isRefund ? PAYMENT_ADJUST_TEXT.STEP_REFUND_DOCUMENTS : PAYMENT_ADJUST_TEXT.stepDocuments(kind.many))}
            {usesCredit ? (
              <>
                <OptionPills
                  label="How it is adjusted"
                  value={adjustMode}
                  options={[{ value: 'AUTO', label: PAYMENT_ADJUST_TEXT.AUTO }, { value: 'MANUAL', label: PAYMENT_ADJUST_TEXT.MANUAL }]}
                  onChange={setAdjustMode}
                />
                <Text style={styles.small}>{adjustMode === 'AUTO' ? PAYMENT_ADJUST_TEXT.autoExplain(`${/^[aeiou]/i.test(kind.one) ? 'An' : 'A'} ${kind.one}`) : PAYMENT_ADJUST_TEXT.manualExplain(kind.many)}</Text>
              </>
            ) : null}

            {openQuery.isLoading ? (
              <ActivityIndicator color={colors.muted} />
            ) : openQuery.error ? (
              <ErrorText message={message(openQuery.error)} />
            ) : open.length === 0 ? (
              <Text style={styles.sub}>{isRefund ? refundText!.none : `No unpaid ${kind.many}. The whole amount stays as an advance.`}</Text>
            ) : isAuto ? (
              <View style={[styles.list]}>
                {open.map((d, i) => {
                  const adjusted = autoOn.get(linkKey(d)) ?? 0;
                  return (
                    <View key={linkKey(d)} style={i > 0 ? styles.lineDivider : undefined}>
                      {docRow(d, <Text style={styles.docAmount}>{adjusted > 0 ? money(adjusted) : '—'}</Text>, undefined, adjusted <= 0)}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.list}>
                {open.map((d, i) => {
                  const key = linkKey(d);
                  const on = Boolean(ticks[key]);
                  return (
                    <View key={key} style={i > 0 ? styles.lineDivider : undefined}>
                      {docRow(
                        d,
                        <View style={{ width: 120 }}>
                          <Field
                            label={PAYMENT_ADJUST_TEXT.COL_PAYS_NOW}
                            prefix="₹"
                            value={on ? typed[key] ?? (manualOn.get(key) ? String(manualOn.get(key)) : '') : ''}
                            onChangeText={(v) => setRowAmount(d, v)}
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                            editable={!isRefund}
                          />
                        </View>,
                        <Pressable onPress={() => toggleTick(d)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Pay ${d.number}`} hitSlop={6}>
                          <Ionicons name={on ? 'checkbox' : 'square-outline'} size={26} color={on ? colors.brandText : colors.muted} />
                        </Pressable>,
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : null}

        {/* 3: check and save */}
        {vendorId ? (
          <>
            {step(3, PAYMENT_ADJUST_TEXT.STEP_CHECK)}
            {amount > 0 || summary || tds > 0 ? (
              <View style={styles.summary}>
                <Text style={styles.summaryTotal}>
                  {PAYMENT_ADJUST_TEXT.total(money(amount), KIND[type].settled)}
                  {creditUsed > 0 ? <Text style={{ color: colors.receive }}> + {PAYMENT_ADJUST_TEXT.fromCredit(money(creditUsed))}</Text> : null}
                </Text>
                {summary || tds > 0 ? <Text style={styles.small}>{summary}{tds > 0 ? `${summary ? ' · ' : ''}TDS ${money(tds)}` : ''}</Text> : null}
              </View>
            ) : null}

            {/* Paid more than due, and the documents expected TDS kept back: remove it (confirmed on save), or keep the extra. */}
            {removable.length > 0 ? (
              <View style={[styles.tdsBox, { borderColor: colors.warnText }]}>
                <Text style={[styles.docNumber, { color: colors.warnText }]}>{DEDUCTION_TEXT.paidMore(extraOverDue)} {removable.map((d) => DEDUCTION_TEXT.expectsTds(d.number, keptBackOf(d))).join(' ')}</Text>
                {(['REMOVE', 'KEEP'] as const).map((choice) => (
                  <Pressable key={choice} onPress={() => setTdsChoice(choice)} accessibilityRole="radio" accessibilityState={{ checked: tdsChoice === choice }} style={styles.radioRow}>
                    <Ionicons name={tdsChoice === choice ? 'radio-button-on' : 'radio-button-off'} size={22} color={tdsChoice === choice ? colors.brandText : colors.muted} />
                    <Text style={[styles.body, { flex: 1 }]}>
                      {choice === 'REMOVE' ? (isPay ? DEDUCTION_TEXT.REMOVE_CHOICE_PAY : DEDUCTION_TEXT.REMOVE_CHOICE) : isPay ? DEDUCTION_TEXT.keepChoicePay(extraOverDue) : DEDUCTION_TEXT.keepChoice(extraOverDue)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {linkError ? <Text style={[styles.small, { color: colors.danger }]}>{linkError}</Text> : null}
          </>
        ) : null}
      </ScrollView>
      <View style={styles.bar}>
        <Button title={saveLabel} tone={isReceipt ? 'receive' : 'primary'} style={{ flex: 1 }} onPress={send} busy={save.isPending} disabled={save.isPending || Boolean(linkError) || needsTdsChoice || !vendorId} />
      </View>

      <PartySheet
        visible={pickParty}
        title={kind.partyLabel}
        selectedId={vendorId || undefined}
        onPick={(p) => {
          // A new party: its documents and credit start again.
          ticksFor.current = null;
          setTicks({});
          setTyped({});
          setVendorId(p.id);
        }}
        onClose={() => setPickParty(false)}
      />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg * 2 },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
    sub: { ...type.subhead, color: c.muted },
    body: { ...type.body, color: c.ink },
    small: { ...type.footnote, color: c.muted },
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    box: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 48, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, borderRadius: 12, paddingHorizontal: spacing.md },
    boxText: { ...type.body, flex: 1, color: c.ink },
    creditBox: { gap: 2, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface },
    step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    stepNo: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    stepNoText: { ...type.footnoteBold, color: '#FFFFFF' },
    stepText: { ...type.headline, color: c.ink },
    toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
    toggleText: { ...type.subhead, fontWeight: '600', color: c.ink },
    list: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, overflow: 'hidden' },
    lineDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    docNumber: { ...type.headline, color: c.ink },
    docAmount: { ...type.headline, color: c.ink },
    summary: { gap: spacing.xs, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface },
    summaryTotal: { ...type.headline, color: c.ink },
    tdsBox: { gap: spacing.sm, padding: spacing.md, borderRadius: 12, borderWidth: 1 },
    radioRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: 44 },
  });
