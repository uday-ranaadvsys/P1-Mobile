import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { DEDUCTION_KIND_ORDER, DEDUCTION_SIDE, DOCUMENT_EDIT_TEXT, SYSTEM_DEFAULTS } from 'floman-shared/constants';
import { isDraftNumber } from 'floman-shared/documentNumber';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { isUnregistered, SUPPLY_TYPE } from 'floman-shared/gst';
import { PERMISSIONS } from 'floman-shared/permissions';
import { GRN_STATUS, PAYABLE_GRN_STATUSES } from 'floman-shared/statuses';
import { documentTotalsWithDeductions } from 'floman-shared/taxDeduction';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ApiError } from '@/api/client';
import { Button } from '@/components/Button';
import { ErrorBanner, NoticeBanner } from '@/components/FormParts';
import { EDIT_FOLDS, NEW_FOLDS, useFolds, useItemsSummary } from '@/components/FoldCard';
import { FormScrollProvider, useFormScroll } from '@/components/FormScroll';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { createGrn, checkVendorBill, getGrn, updateGrn } from '@/features/grns/api';
import { HeaderSection } from '@/features/grns/components/HeaderSection';
import { buildPayload, formFromGrn, fromPurchase, fromPurchaseOrder, headerErrors, isOnGrn, lineProblem, newHeader, offeredLines, RECEIVE_AGAINST, type GrnHeader, type HeaderErrors, type ReceiveAgainst } from '@/features/grns/form';
import { SeriesBadge } from '@/features/documents/components/SeriesBadge';
import { savedBillFrom, useBillAttachment } from '@/features/documents/useBillAttachment';
import { useCustomFieldDefs } from '@/features/documents/useCustomFieldDefs';
import { useDocumentSeries } from '@/features/documents/useDocumentSeries';
import { getPartMeta } from '@/features/parts/api';
import { getParty, type Party } from '@/features/parties/api';
import { getPurchaseOrder } from '@/features/purchase-orders/api';
import { withPurchasePart, zeroRated } from '@/features/purchase-orders/form';
import { partRatesForLines } from '@/features/purchase-orders/partRates';
import { getPurchase } from '@/features/purchases/api';
import { ItemsSection } from '@/features/quotations/components/ItemsSection';
import { SummaryCard } from '@/features/quotations/components/SummaryCard';
import { newLine, priced, type FormLine } from '@/features/quotations/form';
import { personName } from '@/features/quotations/text';
import { DeductionCard, useDeductionSummary } from '@/features/tax/DeductionCard';
import { useDocumentDeductions } from '@/features/tax/useDocumentDeductions';
import { notify } from '@/lib/notify';
import { guardOverOrder } from '@/lib/overOrder';
import { spacing, useColors, useThemed, type Colors } from '@/theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The server's code for an approved GRN paid for more than its corrected total (its money panel is on the web for now). */
const EXTRA_RECEIVED = 'EXTRA_RECEIVED';
const FINISH_ON_WEB = 'Finish this edit on the web for now.';

/** A new form's one empty line. */
const isBlank = (lines: FormLine[]) => lines.length === 1 && !lines[0]!.partName.trim() && !lines[0]!.qty.trim();

/**
 * One form for a GRN, in the web's order: number and series (in the title), our places, Vendor & bill (what it is
 * received against, the vendor's bill and its photo, custom fields), Items, TDS / TCS, Notes & terms, Summary.
 *  - New: blank; or `fromPo` / `fromPurchase`: filled from that order or Purchase, each line at what is left to receive.
 *  - Edit (`id`): a Draft, a waiting or returned one, or an approved one (same number; it goes for approval again,
 *    never back to Draft). Its vendor and what it is against stay.
 *  - Duplicate (`duplicateFrom`): a new standalone GRN with the lines of another; its bill, dates and number are new.
 * Save Draft, and Save & Approve (for someone who may approve) or Submit / Resubmit for Approval. Leaving with changes
 * asks first. Receiving more than ordered asks first.
 */
export default function GrnForm() {
  const { id, duplicateFrom, fromPo: fromPoId, fromPurchase: fromPurchaseId } = useLocalSearchParams<{ id?: string; duplicateFrom?: string; fromPo?: string; fromPurchase?: string }>();
  const editing = Boolean(id);
  const duplicating = !id && Boolean(duplicateFrom);
  const sourceId = id ?? duplicateFrom;
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

  const [header, setHeader] = useState<GrnHeader>(newHeader);
  const [lines, setLines] = useState<FormLine[]>(() => [newLine()]);
  const [extraDiscount, setExtraDiscount] = useState('');
  const [isRoundOff, setIsRoundOff] = useState(true);
  const [errors, setErrors] = useState<HeaderErrors>({});
  const [problem, setProblem] = useState<{ key: string; message: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [billClash, setBillClash] = useState<string | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  // A new blank form is ready at once; one to edit, copy or fill from an order is ready once it has been read.
  const [ready, setReady] = useState(!sourceId && !fromPoId && !fromPurchaseId);

  const { fields } = useCustomFieldDefs(DOCUMENT_TYPE.GRN);
  const series = useDocumentSeries(DOCUMENT_TYPE.GRN, header.billingLocationId);
  const chosenSeries = series.data?.find((o) => o.id === header.seriesId) ?? null;
  // A purchase has all three boxes; a GRN's TCS is typed to match the vendor's bill.
  const deductions = useDocumentDeductions({ kinds: DEDUCTION_KIND_ORDER, side: DEDUCTION_SIDE.PURCHASE, typedTcs: true, vendorId: header.party?.id ?? null, date: header.receivedDate || null, excludeId: id ?? null });
  const canApprove = can(PERMISSIONS.GRNS.APPROVE);
  const unregistered = isUnregistered(header.party);

  // ── The GRN being edited or copied ──
  const source = useQuery({
    queryKey: ['grn-form', sourceId],
    queryFn: async () => {
      const g = await getGrn(sourceId!);
      // Its vendor with its places (someone without Vendors: Read gets the party as the GRN has it).
      const party = g.vendor?.id ? await getParty(g.vendor.id).catch(() => g.vendor as unknown as Party) : null;
      // Editing one made from a PO / Purchase: its other lines with quantity left come unticked.
      let offered: FormLine[] = [];
      if (id && (g.purchaseOrderId || g.purchaseId)) {
        try {
          const onIt = new Set((g.items ?? []).map((i) => i.poItemId || i.purchaseItemId).filter((v): v is string => Boolean(v)));
          offered = g.purchaseOrderId
            ? offeredLines((await getPurchaseOrder(g.purchaseOrderId, id)).items ?? [], onIt, 'PO')
            : offeredLines((await getPurchase(g.purchaseId!, id)).items ?? [], onIt, 'PUR');
        } catch {
          // Its order could not be read: the GRN's own lines are enough to edit it.
        }
      }
      return { g, party, offered };
    },
    enabled: Boolean(sourceId),
    gcTime: 0,
  });
  const saved = source.data?.g;
  const hydrated = useRef(false);
  useEffect(() => {
    if (!source.data || hydrated.current) return;
    hydrated.current = true;
    const { g, party, offered } = source.data;
    if (editing && g.status === GRN_STATUS.CANCELLED) {
      Alert.alert('Cancelled', `GRN ${g.grnNumber} is already cancelled and cannot be edited.`);
      router.back();
      return;
    }
    const f = formFromGrn(g, party, duplicating);
    setHeader(f.header);
    setLines(duplicating ? f.lines : [...f.lines, ...offered]);
    setExtraDiscount(f.extraDiscount);
    setIsRoundOff(f.isRoundOff);
    deductions.loadFrom(g as unknown as Record<string, unknown>, editing); // its TDS / TCS comes with it (editing: its TCS as typed)
    if (!duplicating) bill.setExisting(savedBillFrom(g.billAttachmentUrl, g.attachmentPaths));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.data]);

  // What kind of edit this is (the web's rules).
  const editingApproved = editing && Boolean(saved && PAYABLE_GRN_STATUSES.includes(saved.status));
  const wasApproved = editingApproved || Boolean(editing && saved?.editedAt);
  const returned = editing && saved?.status === GRN_STATUS.RETURNED;
  // A numbered GRN keeps its number and series; a new one or a draft picks its series.
  const numbered = editing && Boolean(saved) && !isDraftNumber(saved!.grnNumber);
  const billOptional = unregistered;
  const vendorLock = header.purchase ? 'The supplier comes from the Purchase' : wasApproved ? DOCUMENT_EDIT_TEXT.partyLocked('GRN', 'vendor') : null;

  // A place's own series: the default one is chosen when the list arrives (or Bill to changes).
  useEffect(() => {
    if (!series.data) return;
    const chosen = series.data.find((o) => o.id === header.seriesId) ?? series.data.find((o) => o.isDefault) ?? series.data[0] ?? null;
    if ((chosen?.id ?? null) !== header.seriesId) setHeader((h) => ({ ...h, seriesId: chosen?.id ?? null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.data]);

  const totals = documentTotalsWithDeductions(lines.filter(isOnGrn).map((l) => priced(l, false)), Number(extraDiscount) || 0, isRoundOff, deductions.picks, deductions.history);
  const itemsSummary = useItemsSummary(lines.filter((l) => isOnGrn(l) && l.partName.trim()).length, totals.grandTotal);
  const taxSummary = useDeductionSummary(deductions, totals.deductions);

  // ── The vendor's bill: is its number already on another Purchase or GRN that financial year? ──
  const checkBill = () => {
    const { party, billNumber, billDate, purchase } = header;
    if (purchase || !party || !billNumber.trim() || !billDate) {
      setBillClash(null);
      return;
    }
    checkVendorBill({ vendorId: party.id, billNumber: billNumber.trim(), billDate, excludeGrnId: id })
      .then(setBillClash)
      .catch(() => undefined);
  };
  useEffect(() => {
    if (ready) checkBill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header.party?.id, header.billDate, header.purchase?.id, ready]);

  // ── Filling the form from an order or a Purchase ──
  const fillFromOrder = async (poId: string) => {
    setLoadingSource(true);
    try {
      const po = await getPurchaseOrder(poId, id);
      const party = po.vendor?.id ? await getParty(po.vendor.id).catch(() => po.vendor as unknown as Party) : null;
      const f = fromPurchaseOrder(po, party);
      setHeader((h) => ({ ...h, ...f.header, notes: h.notes || f.header.notes, billNumber: h.billNumber, billDate: h.billDate }));
      // Lines come from the order when the form has none of its own yet (the web's rule).
      setLines((prev) => (isBlank(prev) ? (f.lines.length ? f.lines : prev) : prev));
      deductions.loadFrom(po as unknown as Record<string, unknown>, false); // the order's ticks come with it
      setErrors((e) => ({ ...e, party: undefined, against: undefined }));
      notify(`Purchase Order "${po.poNumber}" linked successfully!`);
    } catch (e) {
      Alert.alert('Could not load the Purchase Order', message(e));
    } finally {
      setLoadingSource(false);
    }
  };

  const fillFromPurchase = async (purchaseId: string) => {
    setLoadingSource(true);
    try {
      const pur = await getPurchase(purchaseId, id);
      const party = pur.vendor?.id ? await getParty(pur.vendor.id).catch(() => pur.vendor as unknown as Party) : null;
      const f = fromPurchase(pur, party);
      setHeader((h) => ({ ...h, ...f.header }));
      if (f.lines.length) setLines(f.lines);
      deductions.loadFrom(pur as unknown as Record<string, unknown>, false); // the Purchase's ticks come with it
      bill.setExisting(savedBillFrom(pur.billAttachmentUrl, pur.attachmentPaths), pur.purchaseNumber);
      setBillClash(null);
      setErrors((e) => ({ ...e, party: undefined, against: undefined, purchase: undefined, billNumber: undefined, billDate: undefined }));
      notify(`Receiving against Purchase "${pur.purchaseNumber}"`);
    } catch (e) {
      Alert.alert('Could not load the Purchase', message(e));
    } finally {
      setLoadingSource(false);
    }
  };

  // Opened from a Purchase Order (or a Purchase): the form fills itself once.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || sourceId || (!fromPoId && !fromPurchaseId)) return;
    started.current = true;
    void (fromPurchaseId ? fillFromPurchase(fromPurchaseId) : fillFromOrder(fromPoId!)).finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** An order line no longer belongs to any order: it is a typed-in line. */
  const unlinkOrderLines = (prev: FormLine[]) => prev.map((l) => ({ ...l, poItemId: null, selected: l.purchaseItemId ? l.selected : undefined }));
  const unlinkPurchaseLines = (prev: FormLine[]) => prev.map((l) => ({ ...l, purchaseItemId: null, selected: l.poItemId ? l.selected : undefined }));

  const pickOrder = (poId: string | null) => {
    if (poId) return void fillFromOrder(poId);
    setHeader((h) => ({ ...h, purchaseOrder: null }));
    setLines(unlinkOrderLines);
  };

  const changeAgainst = (target: ReceiveAgainst) => {
    if (target === header.receiveAgainst) return;
    setErrors((e) => ({ ...e, against: undefined }));
    // Switching clears what the other choice filled in (nothing to clear on the first pick).
    if (target === RECEIVE_AGAINST.PURCHASE && header.purchaseOrder) setLines(unlinkOrderLines);
    if (target === RECEIVE_AGAINST.PO && header.purchase) {
      setLines(unlinkPurchaseLines);
      setHeader((h) => ({ ...h, receiveAgainst: target, purchase: null, billNumber: '', billDate: '' }));
      return;
    }
    setHeader((h) => ({ ...h, receiveAgainst: target, ...(target === RECEIVE_AGAINST.PURCHASE && { purchaseOrder: null }) }));
  };

  // ── Leaving with changes asks first (the series chosen by default is not a change) ──
  const snapshot = JSON.stringify({ header: { ...header, party: header.party?.id, seriesId: null }, lines, extraDiscount, isRoundOff, deduction: [deductions.ticked, deductions.sectionIds, deductions.tcsTyped], bill: [bill.picked?.uri, bill.existing?.path] });
  const baseline = useRef<string | null>(null);
  const leaving = useRef(false);
  useEffect(() => {
    if (ready && !loadingSource && baseline.current === null) baseline.current = snapshot;
  });
  const dirty = baseline.current !== null && baseline.current !== snapshot;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirty || leaving.current) return;
        e.preventDefault();
        Alert.alert('Leave without saving?', 'Your changes to this GRN will be lost.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, dirty],
  );

  const change = (patch: Partial<GrnHeader>) => {
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
      ...(patch.billNumber !== undefined && { billNumber: undefined }),
      ...(patch.billDate && { billDate: undefined }),
      ...(patch.receivedDate && { receivedDate: undefined }),
      ...(patch.customFields && { custom: undefined }),
    }));
  };

  const save = useMutation({
    mutationFn: async (status: string) => {
      const uploaded = await bill.upload();
      const body = buildPayload({
        header,
        status,
        grnNumber: editing ? saved?.grnNumber : undefined,
        sendSeries: !numbered,
        lines,
        fields,
        extraDiscount,
        isRoundOff,
        deductions: deductions.payload(),
        billAttachmentUrl: uploaded.billAttachmentUrl,
        attachmentPaths: uploaded.attachmentPaths,
      });
      // More than ordered on an order / Purchase line is asked first ("Approve anyway"); "Go back" saves nothing.
      return guardOverOrder((confirmOverOrder) => {
        const sent = confirmOverOrder ? { ...body, confirmOverOrder } : body;
        return editing ? updateGrn(id!, sent) : createGrn(sent);
      });
    },
    onSuccess: (done, status) => {
      if (!done) return; // "Go back": nothing was saved
      void queryClient.invalidateQueries({ queryKey: ['grns'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-order'] });
      if (id) void queryClient.invalidateQueries({ queryKey: ['grn', id] });
      const number = done.grnNumber ?? saved?.grnNumber ?? chosenSeries?.nextNumber ?? '';
      notify(
        editing
          ? `GRN "${number}" updated successfully!`
          : status === GRN_STATUS.DRAFT
            ? `GRN "${number}" saved as draft!`
            : status === GRN_STATUS.PENDING_APPROVAL
              ? `GRN "${number}" submitted for manager approval!`
              : `GRN "${number}" created and inventory updated!`,
      );
      leaving.current = true;
      router.back();
    },
    onError: (e) => {
      setBanner(e instanceof ApiError && e.code === EXTRA_RECEIVED ? `${e.message} ${FINISH_ON_WEB}` : message(e));
      form.toTop();
    },
  });

  // The web's checks, in its order; the server checks the rest (a number already used, a vendor made inactive).
  const submit = (status: string) => {
    const head = headerErrors(header, fields, billOptional);
    const clash = !header.purchase ? billClash : null;
    const active = lines.filter(isOnGrn);
    const lineFail = active.length ? lineProblem(lines) : null;
    setErrors(head);
    setProblem(null);
    setBanner(null);
    if (lineFail) setProblem(lineFail);
    // A mistake in a field is shown at that field (the screen scrolls to it); only what has no field of its own goes in the banner.
    const customKey = head.custom ? Object.keys(head.custom)[0] : undefined;
    const anchor = head.party
      ? 'party'
      : head.against
        ? 'against'
        : head.purchase
          ? 'purchase'
          : head.billNumber || clash
            ? 'billNumber'
            : head.billDate
              ? 'billDate'
              : head.receivedDate
                ? 'receivedDate'
                : customKey
                  ? `custom:${customKey}`
                  : lineFail
                    ? `line:${lineFail.key}`
                    : null;
    if (anchor) {
      folds.reveal(anchor, form.scrollTo);
      return;
    }
    const noField = (!active.length ? 'Tick at least one line to receive.' : undefined) ?? deductions.missingMessage ?? (!numbered && !header.seriesId ? 'Set up a GRN numbering series first.' : undefined);
    if (noField) {
      folds.show('tax');
      setBanner(noField);
      form.toTop();
      return;
    }
    save.mutate(status);
  };

  const approvalStatus = canApprove ? GRN_STATUS.RECEIVED : GRN_STATUS.PENDING_APPROVAL;
  const primaryLabel = canApprove ? 'Save & Approve' : returned ? 'Resubmit for Approval' : 'Submit for Approval';
  const pending = save.isPending ? save.variables : null;
  const returnedBy = personName(saved?.approvedBy);

  if (sourceId && source.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (sourceId && (source.error || !source.data)) {
    return (
      <Centered>
        <ErrorText message={message(source.error ?? 'GRN not found')} />
        <Button title="Try again" tone="secondary" onPress={() => void source.refetch()} />
      </Centered>
    );
  }
  if (!ready) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormScrollProvider value={form.api}>
      <ScrollView ref={form.scrollRef as never} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ScreenTitle
          back={editing ? 'Back' : 'GRN'}
          title={editing ? 'Edit GRN' : 'New GRN'}
          right={
            <SeriesBadge
              docName="GRN"
              options={series.data}
              loading={series.isLoading}
              failed={Boolean(series.error)}
              value={header.seriesId}
              onChange={(seriesId) => change({ seriesId })}
              number={editing ? saved?.grnNumber : undefined}
              locked={numbered}
            />
          }
        />

        {returned && saved ? (
          <NoticeBanner
            tone="danger"
            title={`Returned for changes${returnedBy ? ` · by ${returnedBy}` : ''}`}
            body={`${saved.approvalRemarks ? `“${saved.approvalRemarks}”\n` : ''}Make the changes the approver asked for, then press ${primaryLabel}.`}
          />
        ) : null}
        {editingApproved && saved ? <NoticeBanner tone="warn" title={DOCUMENT_EDIT_TEXT.editingTitle('GRN', saved.grnNumber)} body={DOCUMENT_EDIT_TEXT.banner('GRN', canApprove)} /> : null}
        {duplicating && saved ? (
          <NoticeBanner title={`Cloned from GRN: ${saved.grnNumber}`} body={chosenSeries ? `New draft created with sequential series: ${chosenSeries.nextNumber}` : null} />
        ) : null}
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
          sourceLocked={editing}
          billOptional={billOptional}
          billClash={billClash}
          onBillBlur={checkBill}
          bill={bill}
          onPickOrder={pickOrder}
          onPickPurchase={(purchaseId) => void fillFromPurchase(purchaseId)}
          onChangeAgainst={changeAgainst}
          loadingSource={loadingSource}
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
            back="GRN"
            applyPart={(line, part, fallbackRate) => ({ ...withPurchasePart(line, part, fallbackRate, unregistered), selected: line.selected, poItemId: line.poItemId, purchaseItemId: line.purchaseItemId, heldBy: line.heldBy })}
          />
        </HeaderSection>
      </ScrollView>
      </FormScrollProvider>
      <View style={styles.bar}>
        {/* Edited after approval: it goes for approval again, never back to Draft. */}
        {wasApproved ? null : (
          <Button title="Save Draft" tone="secondary" style={{ flex: 1 }} onPress={() => submit(GRN_STATUS.DRAFT)} busy={pending === GRN_STATUS.DRAFT} disabled={save.isPending} />
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
