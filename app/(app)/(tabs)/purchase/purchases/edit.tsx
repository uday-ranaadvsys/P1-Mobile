import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { DEDUCTION_KIND_ORDER, DEDUCTION_SIDE, DOCUMENT_EDIT_TEXT, SYSTEM_DEFAULTS } from 'floman-shared/constants';
import { isDraftNumber } from 'floman-shared/documentNumber';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { isUnregistered, SUPPLY_TYPE } from 'floman-shared/gst';
import { PERMISSIONS } from 'floman-shared/permissions';
import { PURCHASE_STATUS, SPEND_PURCHASE_STATUSES } from 'floman-shared/statuses';
import { documentTotalsWithDeductions } from 'floman-shared/taxDeduction';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { ErrorBanner, NoticeBanner } from '@/components/FormParts';
import { EDIT_FOLDS, NEW_FOLDS, useFolds, useItemsSummary } from '@/components/FoldCard';
import { FormScrollProvider, useFormScroll } from '@/components/FormScroll';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { SeriesBadge } from '@/features/documents/components/SeriesBadge';
import { savedBillFrom, useBillAttachment } from '@/features/documents/useBillAttachment';
import { useCustomFieldDefs } from '@/features/documents/useCustomFieldDefs';
import { useDocumentSeries } from '@/features/documents/useDocumentSeries';
import { getPartMeta } from '@/features/parts/api';
import { getParty, type Party } from '@/features/parties/api';
import { withPurchasePart, zeroRated } from '@/features/purchase-orders/form';
import { partRatesForLines } from '@/features/purchase-orders/partRates';
import { checkPurchaseBill, createPurchase, getPurchase, updatePurchase } from '@/features/purchases/api';
import { HeaderSection } from '@/features/purchases/components/HeaderSection';
import { buildPayload, formFromPurchase, headerErrors, lineProblem, newHeader, type HeaderErrors, type PurchaseHeader } from '@/features/purchases/form';
import { liveGrns } from '@/features/purchases/text';
import { ItemsSection } from '@/features/quotations/components/ItemsSection';
import { SummaryCard } from '@/features/quotations/components/SummaryCard';
import { newLine, priced, type FormLine } from '@/features/quotations/form';
import { personName } from '@/features/quotations/text';
import { DeductionCard, useDeductionSummary } from '@/features/tax/DeductionCard';
import { useDocumentDeductions } from '@/features/tax/useDocumentDeductions';
import { lineFromPicked, madeFromIndents, useIndentHandoff } from '@/features/indents/pickedLines';
import { notify } from '@/lib/notify';
import { spacing, useColors, useThemed, type Colors } from '@/theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One form for a Purchase (the vendor's bill booked before the goods come in), in the web's order: number and series
 * (in the title), our places, Vendor & bill (with the bill photo and custom fields), Items, TDS / TCS, Notes & terms,
 * Summary.
 *  - New: nothing chosen yet.
 *  - Edit (`id`): a Draft, a waiting or returned one, or an approved one (same number; it goes for approval again,
 *    never back to Draft). Once a GRN is made from it, its vendor stays.
 *  - Duplicate (`duplicateFrom`): a new standalone Purchase with the lines of another; its bill, dates and number are new.
 * Save Draft, and Save & Approve (for someone who may approve) or Submit / Resubmit for Approval. Leaving with changes
 * asks first.
 */
export default function PurchaseForm() {
  const { id, duplicateFrom, fromIndents } = useLocalSearchParams<{ id?: string; duplicateFrom?: string; fromIndents?: string }>();
  const editing = Boolean(id);
  const duplicating = !id && Boolean(duplicateFrom);
  const sourceId = id ?? duplicateFrom;
  // Opened from Manage Indents: the picked lines come with it (taken once).
  const handoff = useIndentHandoff(Boolean(fromIndents) && !id && !duplicateFrom);
  const router = useRouter();
  const navigation = useNavigation() as unknown as {
    addListener: (type: 'beforeRemove', listener: (e: { preventDefault: () => void; data: { action: unknown } }) => void) => () => void;
    dispatch: (action: unknown) => void;
  };
  const queryClient = useQueryClient();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const { can } = useSession();
  const form = useFormScroll();
  // A new document starts at its vendor; an edit starts with every section folded.
  const folds = useFolds(editing ? EDIT_FOLDS : NEW_FOLDS);
  const bill = useBillAttachment();

  const [header, setHeader] = useState<PurchaseHeader>(() => ({ ...newHeader(), ...(handoff?.neededAt ? { billingLocationId: handoff.neededAt, shippingLocationId: handoff.neededAt } : {}) }));
  const [lines, setLines] = useState<FormLine[]>(() => (handoff ? handoff.lines.map(lineFromPicked) : [newLine()]));
  const [extraDiscount, setExtraDiscount] = useState('');
  const [isRoundOff, setIsRoundOff] = useState(true);
  const [errors, setErrors] = useState<HeaderErrors>({});
  const [problem, setProblem] = useState<{ key: string; message: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [billClash, setBillClash] = useState<string | null>(null);
  // A new Purchase is ready at once; one to edit or copy once it has been read.
  const [ready, setReady] = useState(!sourceId);

  const { fields } = useCustomFieldDefs(DOCUMENT_TYPE.PURCHASE);
  const series = useDocumentSeries(DOCUMENT_TYPE.PURCHASE, header.billingLocationId);
  const chosenSeries = series.data?.find((o) => o.id === header.seriesId) ?? null;
  // A purchase has all three boxes: TCS, GST-TDS and TDS.
  const deductions = useDocumentDeductions({ kinds: DEDUCTION_KIND_ORDER, side: DEDUCTION_SIDE.PURCHASE, vendorId: header.party?.id ?? null, date: header.purchaseDate || null, excludeId: id ?? null });
  // Exactly one of the two: who may approve saves it approved, anyone else submits it for approval.
  const canApprove = can(PERMISSIONS.PURCHASES.APPROVE);
  const unregistered = isUnregistered(header.party);

  // ── The Purchase being edited or copied ──
  const source = useQuery({
    queryKey: ['purchase-form', sourceId],
    queryFn: async () => {
      const p = await getPurchase(sourceId!);
      // Its vendor with its places (someone without Vendors: Read gets the party as the Purchase has it).
      const party = p.vendor?.id ? await getParty(p.vendor.id).catch(() => p.vendor as unknown as Party) : null;
      return { p, party };
    },
    enabled: Boolean(sourceId),
    gcTime: 0,
  });
  const saved = source.data?.p;
  const hydrated = useRef(false);
  useEffect(() => {
    if (!source.data || hydrated.current) return;
    hydrated.current = true;
    const { p, party } = source.data;
    if (duplicating && p.status === PURCHASE_STATUS.DRAFT) {
      Alert.alert('Draft Purchases cannot be duplicated', 'Only finalized or approved Purchases can be duplicated.');
      router.back();
      return;
    }
    if (editing && p.status === PURCHASE_STATUS.CANCELLED) {
      Alert.alert('Cancelled', `Cannot edit CANCELLED Purchase "${p.purchaseNumber}". This document has been cancelled.`);
      router.back();
      return;
    }
    const f = formFromPurchase(p, party, duplicating);
    setHeader(f.header);
    setLines(f.lines);
    setExtraDiscount(f.extraDiscount);
    setIsRoundOff(f.isRoundOff);
    deductions.loadFrom(p as unknown as Record<string, unknown>); // its TDS / TCS comes with it
    if (!duplicating) bill.setExisting(savedBillFrom(p.billAttachmentUrl, p.attachmentPaths));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.data]);

  // What kind of edit this is (the web's rules).
  const editingApproved = editing && Boolean(saved && SPEND_PURCHASE_STATUSES.includes(saved.status));
  const wasApproved = editingApproved || Boolean(editing && saved?.editedAt);
  const returned = editing && saved?.status === PURCHASE_STATUS.RETURNED;
  const madeFrom = editing && saved ? liveGrns(saved) : [];
  // Once an approved Purchase has GRNs, its vendor stays.
  const vendorLock = wasApproved && madeFrom.length ? DOCUMENT_EDIT_TEXT.partyLockedBy('vendor', madeFrom) : null;
  // A numbered Purchase keeps its number and series; a new one or a draft picks its series.
  const numbered = editing && Boolean(saved) && !isDraftNumber(saved!.purchaseNumber);
  const billOptional = unregistered;

  // A place's own series: the default one is chosen when the list arrives (or Bill to changes).
  useEffect(() => {
    if (!series.data) return;
    const chosen = series.data.find((o) => o.id === header.seriesId) ?? series.data.find((o) => o.isDefault) ?? series.data[0] ?? null;
    if ((chosen?.id ?? null) !== header.seriesId) setHeader((h) => ({ ...h, seriesId: chosen?.id ?? null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.data]);

  const totals = documentTotalsWithDeductions(lines.map((l) => priced(l, false)), Number(extraDiscount) || 0, isRoundOff, deductions.picks, deductions.history);
  const itemsSummary = useItemsSummary(lines.filter((l) => l.partName.trim()).length, totals.grandTotal);
  const taxSummary = useDeductionSummary(deductions, totals.deductions);

  // ── The vendor's bill: is its number already on another Purchase or GRN that financial year? ──
  const checkBill = () => {
    const { party, billNumber, billDate } = header;
    if (!party || !billNumber.trim() || !billDate) {
      setBillClash(null);
      return;
    }
    checkPurchaseBill({ vendorId: party.id, billNumber: billNumber.trim(), billDate, excludePurchaseId: id })
      .then(setBillClash)
      .catch(() => undefined);
  };
  useEffect(() => {
    if (ready) checkBill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header.party?.id, header.billDate, ready]);

  // ── Leaving with changes asks first (the series chosen by default is not a change) ──
  const snapshot = JSON.stringify({ header: { ...header, party: header.party?.id, seriesId: null }, lines, extraDiscount, isRoundOff, deduction: [deductions.ticked, deductions.sectionIds], bill: [bill.picked?.uri, bill.existing?.path] });
  const baseline = useRef<string | null>(null);
  const leaving = useRef(false);
  useEffect(() => {
    if (ready && baseline.current === null) baseline.current = snapshot;
  });
  const dirty = baseline.current !== null && baseline.current !== snapshot;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirty || leaving.current) return;
        e.preventDefault();
        Alert.alert('Leave without saving?', 'Your changes to this purchase will be lost.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, dirty],
  );

  const change = (patch: Partial<PurchaseHeader>) => {
    if (patch.party) {
      // A vendor with no GSTIN charges no GST: the lines go to 0%. From such a vendor to one with a GSTIN, each line
      // takes its part's GST rate again (the web's handleSelectVendor).
      if (isUnregistered(patch.party)) setLines((prev) => zeroRated(prev));
      else if (unregistered) {
        queryClient
          .fetchQuery({ queryKey: ['part-meta'], queryFn: getPartMeta })
          .then((meta) => {
            const rates = meta.taxRates ?? [];
            const fallback = Number(rates.find((r) => r.isDefault)?.percentage ?? rates[0]?.percentage ?? SYSTEM_DEFAULTS.DEFAULT_TAX_RATE);
            return partRatesForLines(lines, fallback);
          })
          .then((apply) => setLines((prev) => apply(prev)))
          .catch(() => notify("Could not take the GST rates from the parts. Check each line's GST before saving."));
      }
    }
    if (patch.billNumber !== undefined) setBillClash(null);
    setHeader((h) => ({ ...h, ...patch }));
    // A field you have changed is no longer marked.
    setErrors((e) => ({
      ...e,
      ...(patch.party && { party: undefined }),
      ...(patch.purchaseDate && { purchaseDate: undefined }),
      ...(patch.billNumber !== undefined && { billNumber: undefined }),
      ...(patch.billDate && { billDate: undefined }),
      ...(patch.customFields && { custom: undefined }),
    }));
  };

  const save = useMutation({
    mutationFn: async (status: string) => {
      const uploaded = await bill.upload();
      const body = buildPayload({
        header,
        status,
        sendSeries: !numbered,
        lines,
        fields,
        extraDiscount,
        isRoundOff,
        deductions: deductions.payload(),
        billAttachmentUrl: uploaded.billAttachmentUrl,
        attachmentPaths: uploaded.attachmentPaths,
      });
      return editing ? updatePurchase(id!, body) : createPurchase(body);
    },
    onSuccess: (done, status) => {
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      if (id) void queryClient.invalidateQueries({ queryKey: ['purchase', id] });
      const number = done?.purchaseNumber ?? saved?.purchaseNumber ?? chosenSeries?.nextNumber ?? '';
      notify(
        status === PURCHASE_STATUS.DRAFT
          ? `Purchase draft "${number}" saved.`
          : status === PURCHASE_STATUS.APPROVED
            ? `Purchase "${number}" saved and approved.`
            : `Purchase "${number}" submitted for approval.`,
      );
      leaving.current = true;
      router.back();
    },
    onError: (e) => {
      setBanner(message(e));
      form.toTop();
    },
  });

  // The web's checks, in its order; the server checks the rest (a number already used, a vendor made inactive).
  const submit = (status: string) => {
    const head = headerErrors(header, fields, billOptional);
    const lineFail = lineProblem(lines);
    setErrors(head);
    setProblem(null);
    setBanner(null);
    if (lineFail) setProblem(lineFail);
    // A mistake in a field is shown at that field (the screen scrolls to it); only what has no field of its own goes in the banner.
    const customKey = head.custom ? Object.keys(head.custom)[0] : undefined;
    const anchor = head.party
      ? 'party'
      : head.billNumber || billClash
        ? 'billNumber'
        : head.billDate
          ? 'billDate'
          : lineFail
            ? `line:${lineFail.key}`
            : head.purchaseDate
              ? 'purchaseDate'
              : customKey
                ? `custom:${customKey}`
                : null;
    if (anchor) {
      folds.reveal(anchor, form.scrollTo);
      return;
    }
    const noField = deductions.missingMessage ?? (!numbered && !header.seriesId ? 'Set up a Purchase numbering series first.' : undefined);
    if (noField) {
      folds.show('tax');
      setBanner(noField);
      form.toTop();
      return;
    }
    save.mutate(status);
  };

  const approvalStatus = canApprove ? PURCHASE_STATUS.APPROVED : PURCHASE_STATUS.PENDING_APPROVAL;
  const primaryLabel = canApprove ? 'Save & Approve' : returned ? 'Resubmit for Approval' : 'Submit for Approval';
  const pending = save.isPending ? save.variables : null;
  const returnedBy = personName(saved?.approvedBy);

  if (sourceId && source.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (sourceId && (source.error || !source.data)) {
    return (
      <Centered>
        <ErrorText message={message(source.error ?? 'Purchase not found')} />
        <Button title="Try again" tone="secondary" onPress={() => void source.refetch()} />
      </Centered>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormScrollProvider value={form.api}>
      <ScrollView ref={form.scrollRef as never} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ScreenTitle
          back={editing ? 'Back' : 'Purchases'}
          title={editing ? 'Edit Purchase' : 'New Purchase'}
          right={
            <SeriesBadge
              docName="Purchase"
              options={series.data}
              loading={series.isLoading}
              failed={Boolean(series.error)}
              value={header.seriesId}
              onChange={(seriesId) => change({ seriesId })}
              number={editing ? saved?.purchaseNumber : undefined}
              locked={numbered}
            />
          }
        />

        {returned && saved ? (
          <NoticeBanner
            tone="danger"
            title={`Returned for changes${returnedBy ? ` · by ${returnedBy}` : ''}`}
            body={`${saved.approvalRemarks ? `“${saved.approvalRemarks}”\n` : ''}Make the changes (see the remarks on the lines too), then press ${primaryLabel}.`}
          />
        ) : null}
        {editingApproved && saved ? <NoticeBanner tone="warn" title={DOCUMENT_EDIT_TEXT.editingTitle('Purchase', saved.purchaseNumber)} body={DOCUMENT_EDIT_TEXT.banner('purchase', canApprove)} /> : null}
        {duplicating && saved ? (
          <NoticeBanner title={`Cloned from Purchase: ${saved.purchaseNumber}`} body={chosenSeries ? `New draft created with sequential series: ${chosenSeries.nextNumber}` : null} />
        ) : null}
        {handoff ? <NoticeBanner title={madeFromIndents(handoff)} /> : null}
        <ErrorBanner message={banner} />

        <HeaderSection
          value={header}
          onChange={change}
          errors={errors}
          folds={folds}
          itemsSummary={itemsSummary}
          taxCard={<DeductionCard embedded deductions={deductions} values={totals.values} amounts={totals.deductions} />}
          taxSummary={taxSummary}
          vendorLock={vendorLock}
          billingLocked={numbered}
          billOptional={billOptional}
          billClash={billClash}
          onBillBlur={checkBill}
          bill={bill}
          footer={
            <SummaryCard totals={totals} exempt={false} extraDiscount={extraDiscount} onExtraDiscount={setExtraDiscount} isRoundOff={isRoundOff} onRoundOff={setIsRoundOff} purchase />
          }
        >
          <ItemsSection
            lines={lines}
            onChange={(next) => {
              setLines(next);
              setProblem(null);
            }}
            supplyType={SUPPLY_TYPE.B2B}
            problem={problem}
            hideTitle
            back="Purchase"
            applyPart={(line, part, fallbackRate) => ({ ...withPurchasePart(line, part, fallbackRate, unregistered), indentRef: line.indentRef, indentAllocations: line.indentAllocations })}
          />
        </HeaderSection>
      </ScrollView>
      </FormScrollProvider>
      <View style={styles.bar}>
        {/* Edited after approval: it goes for approval again, never back to Draft. */}
        {wasApproved ? null : (
          <Button title="Save Draft" tone="secondary" style={{ flex: 1 }} onPress={() => submit(PURCHASE_STATUS.DRAFT)} busy={pending === PURCHASE_STATUS.DRAFT} disabled={save.isPending} />
        )}
        <Button title={primaryLabel} style={{ flex: 1 }} onPress={() => submit(approvalStatus)} busy={pending === approvalStatus} disabled={save.isPending} />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
