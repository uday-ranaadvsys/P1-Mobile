import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { DEDUCTION_KIND, DOCUMENT_EDIT_TEXT } from 'floman-shared/constants';
import { isDraftNumber } from 'floman-shared/documentNumber';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { noteLineLeft } from 'floman-shared/notes';
import { PERMISSIONS } from 'floman-shared/permissions';
import { NOTE_STATUS } from 'floman-shared/statuses';
import { noteTotalsWithDeductions } from 'floman-shared/taxDeduction';
import { qtyTextAllowed } from 'floman-shared/quantity';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { DocumentSheet, type DocumentChoice } from '@/components/DocumentSheet';
import { Field } from '@/components/Field';
import { EDIT_FOLDS, FoldCard, NEW_FOLDS, useFolds, useItemsSummary } from '@/components/FoldCard';
import { ErrorBanner, FormCard, NoticeBanner, OptionPills, ReadOnlyField } from '@/components/FormParts';
import { FormScrollProvider, ScrollAnchor, useFormScroll } from '@/components/FormScroll';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { createDebitNote, getDebitNote, getSourceLines, listSources, updateDebitNote } from '@/features/debit-notes/api';
import { activeRows, buildPayload, discountForQty, headerErrors, headerFromNote, itemAmounts, newHeader, pricedRow, rowFromItem, rowOf, rowProblem, type HeaderErrors, type NoteHeader, type NoteRow } from '@/features/debit-notes/form';
import { NotesTermsSection } from '@/features/documents/components/NotesTermsSection';
import { SeriesBadge } from '@/features/documents/components/SeriesBadge';
import { useDocumentSeries } from '@/features/documents/useDocumentSeries';
import { SummaryCard } from '@/features/quotations/components/SummaryCard';
import { money } from '@/features/quotations/text';
import { formatDate, formatMoney } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const decimal = (text: string) => text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
const num = (text: string) => (Number.isFinite(parseFloat(text)) ? parseFloat(text) : 0);

const DISCOUNT_OPTIONS = [
  { value: 'percentage', label: '%' },
  { value: 'amount', label: '₹' },
] as const;

/**
 * One form for a Debit Note (money claimed from a vendor against a GRN, for goods returned or a price change): the GRN
 * picks the vendor and the lines (as the GRN charged them); you set the quantity, rate and discount taken off each, the
 * reason, and the note's date.
 *  - New (`sourceId` opens it on that GRN): pick the GRN first.
 *  - Edit (`id`): a Draft, a waiting or returned note, or an approved one (same number; it goes for approval again).
 * Save Draft, and Save & Approve (for someone who may approve) or Submit for Approval. Leaving with changes asks first.
 */
export default function DebitNoteForm() {
  const { id, sourceId: presetSource } = useLocalSearchParams<{ id?: string; sourceId?: string }>();
  const editing = Boolean(id);
  const router = useRouter();
  const navigation = useNavigation() as unknown as {
    addListener: (type: 'beforeRemove', listener: (e: { preventDefault: () => void; data: { action: unknown } }) => void) => () => void;
    dispatch: (action: unknown) => void;
  };
  const queryClient = useQueryClient();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const { can } = useSession();
  const form = useFormScroll();
  const folds = useFolds(editing ? EDIT_FOLDS : NEW_FOLDS);

  const [header, setHeader] = useState<NoteHeader>(newHeader);
  const [sourceId, setSourceId] = useState<string | null>(presetSource ?? null);
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [errors, setErrors] = useState<HeaderErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [pickSource, setPickSource] = useState(false);
  const [ready, setReady] = useState(!id && !presetSource);

  const canApprove = can(PERMISSIONS.DEBIT_NOTES.APPROVE);

  // ── The note being edited ──
  const saved = useQuery({ queryKey: ['debit-note-form', id], queryFn: () => getDebitNote(id!), enabled: editing, gcTime: 0 });
  const note = saved.data;
  // ── The GRN and its lines, with what is left to take off each (not counting this note) ──
  const source = useQuery({
    queryKey: ['debit-note-source', sourceId, id ?? null],
    queryFn: () => getSourceLines(sourceId!, id),
    enabled: Boolean(sourceId) && (!editing || Boolean(note)),
    gcTime: 0,
  });
  const grn = source.data?.source ?? null;
  const lines = source.data?.lines ?? [];
  const deductionSources = source.data?.deductions ?? {};
  const lineOf = useMemo(() => new Map(lines.map((l) => [l.sourceItemId, l])), [lines]);

  const series = useDocumentSeries(DOCUMENT_TYPE.DEBIT_NOTE, grn?.billingLocationId ?? '');
  const chosenSeries = series.data?.find((o) => o.id === header.seriesId) ?? null;

  // The note's own fields first (an edit), then the rows once the GRN's lines have come.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!editing || !note || hydrated.current) return;
    if (note.status === NOTE_STATUS.CANCELLED) {
      Alert.alert('Cancelled', `Cannot edit CANCELLED Debit Note "${note.noteNumber}". This document has been cancelled.`);
      router.back();
      return;
    }
    hydrated.current = true;
    setHeader(headerFromNote(note));
    setSourceId(note.grnId);
  }, [editing, note, router]);

  const rowsSet = useRef(false);
  useEffect(() => {
    if (!source.data || rowsSet.current) return;
    if (editing && !note) return;
    rowsSet.current = true;
    if (note) setRows((note.items ?? []).map(rowFromItem));
    else {
      // New: every line as it was charged (not the ones already taken off in full).
      setRows(source.data.lines.filter((l) => noteLineLeft(l).taxable > 0).map(rowOf));
      setHeader((h) => ({ ...h, extraDiscount: Number(source.data!.source.extraDiscount) ? String(Number(source.data!.source.extraDiscount)) : '', isRoundOff: source.data!.source.isRoundOff !== false }));
    }
    setReady(true);
  }, [source.data, note, editing]);

  const wasApproved = editing && Boolean(note && (note.status === NOTE_STATUS.APPROVED || note.editedAt));
  const editingApproved = editing && note?.status === NOTE_STATUS.APPROVED;
  const returned = editing && note?.status === NOTE_STATUS.RETURNED;
  // A numbered note keeps its number and series; a new one or a draft picks its series.
  const numbered = editing && Boolean(note) && !isDraftNumber(note!.noteNumber);

  // The series chosen by default is the place's own; it follows the GRN.
  useEffect(() => {
    if (!series.data) return;
    const chosen = series.data.find((o) => o.id === header.seriesId) ?? series.data.find((o) => o.isDefault) ?? series.data[0] ?? null;
    if ((chosen?.id ?? null) !== header.seriesId) setHeader((h) => ({ ...h, seriesId: chosen?.id ?? null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.data]);

  // ── Line amounts and totals (the document's calculation) ──
  const active = activeRows(rows);
  const totals = noteTotalsWithDeductions(active.map((r) => pricedRow(r, lineOf.get(r.sourceItemId))), num(header.extraDiscount), header.isRoundOff, deductionSources);
  const amountsOf = new Map(active.map((r, i) => [r.sourceItemId, totals.items[i]!]));
  const problemOf = (row: NoteRow) => rowProblem(row, lineOf.get(row.sourceItemId), amountsOf.get(row.sourceItemId));
  const firstProblem = rows.map((r) => ({ r, p: problemOf(r) })).find((x) => x.p);
  const itemsSummary = useItemsSummary(active.length, totals.grandTotal);
  /** The GRN's lines that were removed from the note (and still have something left to take off). */
  const removed = lines.filter((l) => noteLineLeft(l).taxable > 0 && !rows.some((r) => r.sourceItemId === l.sourceItemId));

  // ── Leaving with changes asks first (the series chosen by default is not a change) ──
  const snapshot = JSON.stringify({ header: { ...header, seriesId: null }, rows, sourceId });
  const baseline = useRef<string | null>(null);
  const leaving = useRef(false);
  useEffect(() => {
    if (ready && baseline.current === null && (rows.length > 0 || !sourceId)) baseline.current = snapshot;
  });
  const dirty = baseline.current !== null && baseline.current !== snapshot;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirty || leaving.current) return;
        e.preventDefault();
        Alert.alert('Leave without saving?', 'Your changes to this debit note will be lost.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, dirty],
  );

  const change = (patch: Partial<NoteHeader>) => {
    setHeader((h) => ({ ...h, ...patch }));
    setErrors((e) => ({ ...e, ...(patch.noteDate && { noteDate: undefined }), ...(patch.reason && { reason: undefined }) }));
  };
  const setRow = (key: string, patch: Partial<NoteRow>) => setRows((prev) => prev.map((r) => (r.sourceItemId === key ? { ...r, ...patch } : r)));

  const pickGrn = (choice: DocumentChoice | null) => {
    if (!choice) return;
    // A different GRN: its lines start again.
    rowsSet.current = false;
    setRows([]);
    setSourceId(choice.id);
    setErrors((e) => ({ ...e, source: undefined, lines: undefined }));
  };

  const save = useMutation({
    mutationFn: (status: string) => {
      const body = buildPayload({ header, status, sendSeries: !numbered, sourceId: sourceId!, rows });
      return editing ? updateDebitNote(id!, body) : createDebitNote(body);
    },
    onSuccess: ({ message: said }) => {
      void queryClient.invalidateQueries({ queryKey: ['debit-notes'] });
      void queryClient.invalidateQueries({ queryKey: ['grns'] });
      void queryClient.invalidateQueries({ queryKey: ['grn'] });
      if (id) void queryClient.invalidateQueries({ queryKey: ['debit-note', id] });
      notify(said || 'Debit Note saved.');
      leaving.current = true;
      router.back();
    },
    onError: (e) => {
      setBanner(message(e));
      form.toTop();
    },
  });

  // The web's checks, in its order; the server checks the rest (a number already used).
  const submit = (status: string) => {
    const head = headerErrors(header, Boolean(grn));
    const noLines = Boolean(grn) && active.length === 0;
    setBanner(null);
    setErrors({ ...head, ...(noLines && { lines: 'Add at least one line with a quantity.' }) });
    const anchor = head.source ? 'source' : noLines ? 'line:empty' : firstProblem ? `line:${firstProblem.r.sourceItemId}` : head.noteDate ? 'noteDate' : head.reason ? 'reason' : null;
    if (anchor) {
      folds.reveal(anchor, form.scrollTo);
      return;
    }
    save.mutate(status);
  };

  const approvalStatus = canApprove ? NOTE_STATUS.APPROVED : NOTE_STATUS.PENDING_APPROVAL;
  const primaryLabel = canApprove ? 'Save & Approve' : returned ? 'Resubmit for Approval' : 'Submit for Approval';
  const pending = save.isPending ? save.variables : null;

  const fetchChoices = async (search: string): Promise<DocumentChoice[]> =>
    (await listSources(search)).map((s) => ({ id: s.id, title: s.number, subtitle: [s.partyName, s.reference && `Bill ${s.reference}`, s.date && formatDate(s.date)].filter(Boolean).join(' · '), right: money(s.amount) }));

  if ((editing && saved.isLoading) || (editing && (saved.error || !saved.data))) {
    return (
      <Centered>
        {saved.isLoading ? <ActivityIndicator color={colors.brandText} /> : <ErrorText message={message(saved.error ?? 'Debit Note not found')} />}
        {saved.isLoading ? null : <Button title="Try again" tone="secondary" onPress={() => void saved.refetch()} />}
      </Centered>
    );
  }

  // Links of an approved note to other GRNs come off when it is edited (they stay as the vendor's credit).
  const linksElsewhere = (note?.allocations ?? []).filter((a) => a.grnId !== note?.grnId && a.grn).map((a) => ({ number: a.grn!.grnNumber, amount: Number(a.amount) || 0 }));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormScrollProvider value={form.api}>
        <ScrollView ref={form.scrollRef as never} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <ScreenTitle
            back={editing ? 'Back' : 'Debit Notes'}
            title={editing ? 'Edit Debit Note' : 'New Debit Note'}
            right={
              <SeriesBadge
                docName="Debit Note"
                options={series.data}
                loading={series.isLoading}
                failed={Boolean(series.error)}
                value={header.seriesId}
                onChange={(seriesId) => change({ seriesId })}
                number={editing ? note?.noteNumber : undefined}
                locked={numbered}
              />
            }
          />

          {returned && note ? (
            <NoticeBanner tone="danger" title="Returned for changes" body={`${note.approvalRemarks ? `“${note.approvalRemarks}”\n` : ''}Make the changes asked for, then press ${primaryLabel}.`} />
          ) : null}
          {editingApproved && note ? (
            <NoticeBanner
              tone="warn"
              title={DOCUMENT_EDIT_TEXT.editingTitle('Debit Note', note.noteNumber)}
              body={[DOCUMENT_EDIT_TEXT.banner('debit note', canApprove), ...(linksElsewhere.length ? [DOCUMENT_EDIT_TEXT.linksOff(formatMoney(linksElsewhere.reduce((s, l) => s + l.amount, 0)), linksElsewhere.map((l) => l.number), 'vendor')] : [])].join('\n')}
            />
          ) : null}
          {grn ? <NoticeBanner title="Once approved, this debit is adjusted on the GRN." /> : null}
          <ErrorBanner message={banner} />

          <FoldCard
            title="GRN & reason"
            summary={[grn?.grnNumber, grn?.vendor?.name && hide.text(grn.vendor.name), header.noteDate && formatDate(header.noteDate)].filter(Boolean).join(' · ') || 'Not filled in yet'}
            open={folds.open.vendor}
            onToggle={() => folds.toggle('vendor')}
          >
            <ScrollAnchor name="source">
              <View style={{ gap: spacing.xs }}>
                <Text style={styles.label}>GRN<Text style={{ color: colors.danger }}> *</Text></Text>
                <Pressable
                  onPress={() => !editing && setPickSource(true)}
                  disabled={editing}
                  accessibilityRole="button"
                  accessibilityLabel={`GRN: ${grn?.grnNumber ?? 'not chosen'}`}
                  style={({ pressed }) => [styles.box, errors.source ? { borderColor: colors.danger } : null, editing && { opacity: 0.6 }, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[styles.boxText, !grn && { color: colors.placeholder }]} numberOfLines={1}>
                    {grn ? [grn.grnNumber, grn.vendorInvoiceNumber && `Bill ${grn.vendorInvoiceNumber}`].filter(Boolean).join(' · ') : 'Search GRN number, vendor, bill…'}
                  </Text>
                  {editing ? <Ionicons name="lock-closed" size={16} color={colors.muted} /> : <Ionicons name="chevron-down" size={18} color={colors.muted} />}
                </Pressable>
                {errors.source ? <Text style={[styles.error, { color: colors.danger }]}>{errors.source}</Text> : null}
                {source.isLoading && sourceId ? <ActivityIndicator color={colors.muted} /> : null}
                {source.error ? <Text style={[styles.error, { color: colors.danger }]}>{message(source.error)}</Text> : null}
              </View>
            </ScrollAnchor>

            <ReadOnlyField label="Vendor" text={grn?.vendor ? hide.text(grn.vendor.name) : 'Filled in from the GRN'} empty={!grn?.vendor} />
            <ReadOnlyField label="Vendor Bill No" text={grn?.vendorInvoiceNumber ?? '—'} empty={!grn?.vendorInvoiceNumber} />
            <ReadOnlyField label="Bill Date" text={grn?.vendorInvoiceDate ? formatDate(grn.vendorInvoiceDate) : '—'} empty={!grn?.vendorInvoiceDate} />
            <ReadOnlyField label="Received Date" text={grn?.grnDate ? formatDate(grn.grnDate) : '—'} empty={!grn?.grnDate} />

            <ScrollAnchor name="noteDate"><DateField label="Debit Note Date" required value={header.noteDate} onChange={(noteDate) => change({ noteDate })} error={errors.noteDate} /></ScrollAnchor>
            <ScrollAnchor name="reason">
              <Field
                label="Reason"
                required
                value={header.reason}
                onChangeText={(reason) => change({ reason })}
                placeholder="e.g. 5 nos rejected at inspection, returned"
                multiline
                maxLength={500}
                autoCapitalize="sentences"
                error={errors.reason}
              />
            </ScrollAnchor>
            <Field label="Vendor Credit Note No" value={header.partyNoteNumber} onChangeText={(partyNoteNumber) => change({ partyNoteNumber })} placeholder="When the vendor sends it" maxLength={100} />
            <DateField label="Vendor Credit Note Date" value={header.partyNoteDate} onChange={(partyNoteDate) => change({ partyNoteDate })} onClear={() => change({ partyNoteDate: '' })} />
          </FoldCard>

          <FoldCard title="Items" summary={itemsSummary} open={folds.open.items} onToggle={() => folds.toggle('items')}>
            <View style={{ gap: spacing.md }}>
              {!grn ? (
                <ScrollAnchor name="line:empty"><Text style={styles.muted}>The lines are filled in when the GRN is selected.</Text></ScrollAnchor>
              ) : source.isLoading ? (
                <ActivityIndicator color={colors.muted} />
              ) : rows.length === 0 ? (
                <ScrollAnchor name="line:empty">
                  <Text style={[styles.muted, errors.lines ? { color: colors.danger } : null]}>
                    {errors.lines ??
                      (lines.length > removed.length ? 'Every line of this GRN has already been debited in full.' : 'All lines were removed. Use "Add GRN lines" to put them back.')}
                  </Text>
                </ScrollAnchor>
              ) : null}

              {rows.map((row) => {
                const line = lineOf.get(row.sourceItemId);
                if (!line) return null;
                const a = itemAmounts({ ...pricedRow(row, line) });
                const problem = problemOf(row);
                return (
                  <ScrollAnchor key={row.sourceItemId} name={`line:${row.sourceItemId}`}>
                    <FormCard>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.lineName}>{line.partName}</Text>
                          {line.partCode || line.hsn ? <Text style={styles.small}>{[line.partCode, line.hsn && `HSN ${line.hsn}`].filter(Boolean).join(' · ')}</Text> : null}
                          <Text style={styles.small}>Received: {line.qty} {line.uom}{line.freeQty > 0 ? ` (+${line.freeQty} free, not changed by a note)` : ''}</Text>
                          {line.heldBy?.map((h) => <Text key={h.number} style={[styles.small, { color: colors.warnText }]}>{h.qty} on draft {h.number}</Text>)}
                        </View>
                        <Pressable onPress={() => setRows((prev) => prev.filter((r) => r.sourceItemId !== row.sourceItemId))} accessibilityRole="button" accessibilityLabel={`Remove ${line.partName}`} hitSlop={8} style={styles.iconButton}>
                          <Ionicons name="trash-outline" size={22} color={colors.danger} />
                        </Pressable>
                      </View>
                      <View style={styles.pair}>
                        <View style={{ flex: 1 }}>
                          <Field
                            label="Qty"
                            required
                            value={row.qty}
                            onChangeText={(v) => qtyTextAllowed(v) && setRow(row.sourceItemId, { qty: v, ...(discountForQty(row, line, num(v)) !== null && { discount: discountForQty(row, line, num(v))! }) })}
                            placeholder="0"
                            keyboardType="decimal-pad"
                            suffix={line.uom}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Field label="Rate" required prefix="₹" value={row.unitPrice} onChangeText={(v) => setRow(row.sourceItemId, { unitPrice: decimal(v) })} placeholder="0.00" keyboardType="decimal-pad" />
                        </View>
                      </View>
                      <View style={styles.pair}>
                        <View style={{ flex: 1 }}>
                          <Field
                            label="Discount"
                            value={row.discount}
                            onChangeText={(v) => {
                              const next = decimal(v);
                              setRow(row.sourceItemId, { discount: row.discountType === 'percentage' && Number(next) > 100 ? '100' : next });
                            }}
                            placeholder="0"
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <OptionPills label="Discount in % or ₹" value={row.discountType as 'percentage' | 'amount'} options={DISCOUNT_OPTIONS as unknown as { value: 'percentage' | 'amount'; label: string }[]} onChange={(discountType) => setRow(row.sourceItemId, { discountType })} />
                      </View>
                      {problem ? <Text style={[styles.error, { color: colors.danger }]}>{problem}</Text> : null}
                      <View style={styles.amountRow}>
                        <Text style={styles.small}>GST {line.taxRate}% (as charged)</Text>
                        <Text style={styles.lineName}>{hide.hidden ? hide.rupees(0) : formatMoney(a.totalWithTax)}</Text>
                      </View>
                    </FormCard>
                  </ScrollAnchor>
                );
              })}

              {removed.length > 0 ? (
                <Pressable
                  onPress={() => {
                    const restored = [...rows, ...removed.map(rowOf)];
                    setRows(lines.flatMap((l) => restored.filter((r) => r.sourceItemId === l.sourceItemId)));
                  }}
                  accessibilityRole="button"
                  style={styles.addLines}
                >
                  <Ionicons name="add" size={18} color={colors.ink} />
                  <Text style={styles.addLinesText}>Add GRN lines ({removed.length})</Text>
                </Pressable>
              ) : null}
            </View>
          </FoldCard>

          <NotesTermsSection
            fold={{ open: folds.open.notes, onToggle: () => folds.toggle('notes') }}
            documentType={DOCUMENT_TYPE.DEBIT_NOTE}
            notes={header.notes}
            terms={header.terms}
            notesPlaceholder="Enter your notes"
            termsPlaceholder="Enter your business Terms and Conditions"
            onChange={change}
          />

          {/* Summary: its share of the GRN's TCS is in the total; the TDS it gives back is less to pay the vendor. */}
          <SummaryCard
            totals={{ ...totals, netDue: totals.netCredit }}
            exempt={false}
            extraDiscount={header.extraDiscount}
            onExtraDiscount={(extraDiscount) => change({ extraDiscount })}
            isRoundOff={header.isRoundOff}
            onRoundOff={(isRoundOff) => change({ isRoundOff })}
            purchase
            givenBack
          />
        </ScrollView>
      </FormScrollProvider>
      <View style={styles.bar}>
        {/* Edited after approval: it goes for approval again, never back to Draft. */}
        {wasApproved ? null : <Button title="Save Draft" tone="secondary" style={{ flex: 1 }} onPress={() => submit(NOTE_STATUS.DRAFT)} busy={pending === NOTE_STATUS.DRAFT} disabled={save.isPending} />}
        <Button title={primaryLabel} style={{ flex: 1 }} onPress={() => submit(approvalStatus)} busy={pending === approvalStatus} disabled={save.isPending} />
      </View>

      <DocumentSheet
        visible={pickSource}
        title="GRN"
        queryKey="debit-note-sources"
        fetchChoices={fetchChoices}
        selectedId={sourceId}
        searchPlaceholder="Search GRN number, vendor, bill…"
        emptyText="No GRNs to raise a Debit Note against."
        onPick={pickGrn}
        onClose={() => setPickSource(false)}
      />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    box: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 48, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, borderRadius: 12, paddingHorizontal: spacing.md },
    boxText: { ...type.body, flex: 1, color: c.ink },
    error: { ...type.footnote },
    muted: { ...type.subhead, color: c.muted },
    small: { ...type.footnote, color: c.muted },
    lineName: { ...type.headline, color: c.ink },
    iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    pair: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-end' },
    amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    addLines: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
    addLinesText: { ...type.subhead, fontWeight: '600', color: c.ink },
  });
