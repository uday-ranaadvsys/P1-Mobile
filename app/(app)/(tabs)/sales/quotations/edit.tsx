import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { DEDUCTION_KIND, DOCUMENT_EDIT_TEXT, SYSTEM_DEFAULTS } from 'floman-shared/constants';
import { isDraftNumber } from 'floman-shared/documentNumber';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { isZeroRatedSupply } from 'floman-shared/gst';
import { PERMISSIONS } from 'floman-shared/permissions';
import { QUOTATION_STATUS, QUOTED_QUOTATION_STATUSES } from 'floman-shared/statuses';
import { documentTotalsWithDeductions } from 'floman-shared/taxDeduction';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { ErrorBanner, NoticeBanner } from '@/components/FormParts';
import { FormScrollProvider, useFormScroll } from '@/components/FormScroll';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { getParty, type Party } from '@/features/parties/api';
import { createQuotation, getQuotation, updateQuotation } from '@/features/quotations/api';
import { HeaderSection } from '@/features/quotations/components/HeaderSection';
import { ItemsSection } from '@/features/quotations/components/ItemsSection';
import { SeriesBadge } from '@/features/documents/components/SeriesBadge';
import { SummaryCard } from '@/features/quotations/components/SummaryCard';
import { buildPayload, formFromQuotation, headerErrors, lineProblem, newHeader, newLine, priced, type FormLine, type HeaderErrors, type QuotationHeader } from '@/features/quotations/form';
import { partRatesForZeroLines } from '@/features/quotations/partRates';
import { personName } from '@/features/quotations/text';
import { useCustomFieldDefs } from '@/features/documents/useCustomFieldDefs';
import { liveMadeFrom } from '@/features/quotations/useQuotationActions';
import { useDocumentSeries } from '@/features/documents/useDocumentSeries';
import { DeductionCard } from '@/features/tax/DeductionCard';
import { useDocumentDeductions } from '@/features/tax/useDocumentDeductions';
import { notify } from '@/lib/notify';
import { spacing, useColors, useThemed, type Colors } from '@/theme';

/** A Quotation has the TCS box only (shared/taxDeduction.ts). */
const TCS_BOX = [DEDUCTION_KIND.TCS] as const;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One form for a Quotation, in the web's order: number and series (in the title), our places, Customer & dates (with
 * the custom fields), Items, TDS / TCS, Notes & terms, Summary.
 *  - New: nothing chosen yet.
 *  - Edit (`id`): a Draft, a returned one, or an approved one (same number; it goes for approval again, never back to
 *    Draft). Once Sales Orders or Proformas are made from it, its customer stays.
 *  - Duplicate (`duplicateFrom`): a copy of an approved or answered one, with a new number and new dates.
 * Save Draft, and Save & Approve (for someone who may approve) or Submit / Resubmit for Approval. Leaving with
 * changes asks first.
 */
export default function QuotationForm() {
  const { id, duplicateFrom } = useLocalSearchParams<{ id?: string; duplicateFrom?: string }>();
  const editing = Boolean(id);
  const duplicating = !id && Boolean(duplicateFrom);
  const sourceId = id ?? duplicateFrom;
  const router = useRouter();
  // Only the part of the navigation object that is used (its own types do not include beforeRemove here).
  const navigation = useNavigation() as unknown as {
    addListener: (type: 'beforeRemove', listener: (e: { preventDefault: () => void; data: { action: unknown } }) => void) => () => void;
    dispatch: (action: unknown) => void;
  };
  const queryClient = useQueryClient();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const { can } = useSession();
  const form = useFormScroll();

  const [header, setHeader] = useState<QuotationHeader>(newHeader);
  const [lines, setLines] = useState<FormLine[]>(() => [newLine()]);
  const [extraDiscount, setExtraDiscount] = useState('');
  const [isRoundOff, setIsRoundOff] = useState(true);
  const [errors, setErrors] = useState<HeaderErrors>({});
  const [problem, setProblem] = useState<{ key: string; message: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  // A new Quotation is ready at once; one to edit or copy once it has been read.
  const [ready, setReady] = useState(!sourceId);

  const { fields } = useCustomFieldDefs(DOCUMENT_TYPE.QUOTATION);
  const series = useDocumentSeries(DOCUMENT_TYPE.QUOTATION, header.billingLocationId);
  const chosenSeries = series.data?.find((o) => o.id === header.seriesId) ?? null;
  const deductions = useDocumentDeductions({ kinds: TCS_BOX, vendorId: header.party?.id ?? null, date: header.issueDate || null });
  // Exactly one of the two: who may approve saves it approved, anyone else submits it for approval.
  const canApprove = can(PERMISSIONS.QUOTATIONS.APPROVE);

  // ── The Quotation being edited or copied ──
  const source = useQuery({
    queryKey: ['quotation-form', sourceId],
    queryFn: async () => {
      const q = await getQuotation(sourceId!);
      // Its customer with its places (someone without Vendors: Read gets the party as the Quotation has it).
      const party = q.vendor?.id ? await getParty(q.vendor.id).catch(() => q.vendor as unknown as Party) : null;
      return { q, party };
    },
    enabled: Boolean(sourceId),
    gcTime: 0,
  });
  const q = source.data?.q;
  const hydrated = useRef(false);
  useEffect(() => {
    if (!source.data || hydrated.current) return;
    hydrated.current = true;
    const { q: saved, party } = source.data;
    if (duplicating && saved.status === QUOTATION_STATUS.DRAFT) {
      Alert.alert('Draft Quotations cannot be duplicated', 'Only finalized or approved Quotations can be duplicated.');
      router.back();
      return;
    }
    if (editing && saved.status === QUOTATION_STATUS.CANCELLED) {
      Alert.alert('Cancelled', `Cannot edit CANCELLED Quotation "${saved.quotationNumber}". This document has been cancelled.`);
      router.back();
      return;
    }
    const f = formFromQuotation(saved, party, duplicating);
    setHeader(f.header);
    setLines(f.lines);
    setExtraDiscount(f.extraDiscount);
    setIsRoundOff(f.isRoundOff);
    deductions.loadFrom(saved as unknown as Record<string, unknown>); // its TCS comes with it
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.data]);

  // What kind of edit this is (the web's rules).
  const editingApproved = editing && Boolean(q && QUOTED_QUOTATION_STATUSES.includes(q.status));
  const wasApproved = editingApproved || Boolean(editing && q?.editedAt);
  const returned = editing && q?.status === QUOTATION_STATUS.APPROVER_RETURNED;
  const madeFrom = editing && q ? liveMadeFrom(q) : [];
  // A numbered Quotation keeps its number and series; a new one or a draft picks its series.
  const numbered = editing && Boolean(q) && !isDraftNumber(q!.quotationNumber);

  // A place's own series: the default one is chosen when the list arrives (or Bill from changes).
  useEffect(() => {
    if (!series.data) return;
    const chosen = series.data.find((o) => o.id === header.seriesId) ?? series.data.find((o) => o.isDefault) ?? series.data[0] ?? null;
    if ((chosen?.id ?? null) !== header.seriesId) setHeader((h) => ({ ...h, seriesId: chosen?.id ?? null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.data]);

  const exempt = isZeroRatedSupply(header.supplyType);
  const totals = documentTotalsWithDeductions(lines.map((l) => priced(l, exempt)), Number(extraDiscount) || 0, isRoundOff, deductions.picks, deductions.history);

  // ── Leaving with changes asks first (the series chosen by default is not a change) ──
  const snapshot = JSON.stringify({ header: { ...header, party: header.party?.id, seriesId: null }, lines, extraDiscount, isRoundOff, deduction: [deductions.ticked, deductions.sectionIds] });
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
        Alert.alert('Leave without saving?', 'Your changes to this quotation will be lost.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, dirty],
  );

  const change = (patch: Partial<QuotationHeader>) => {
    // Leaving SEZ with LUT: the lines at 0% take their GST rate back from the Part Master.
    if (patch.supplyType !== undefined && isZeroRatedSupply(header.supplyType) && !isZeroRatedSupply(patch.supplyType)) {
      partRatesForZeroLines(lines)
        .then((apply) => setLines((prev) => apply(prev)))
        .catch(() => notify("Could not take the GST rates from the parts. Check each line's GST before saving."));
    }
    setHeader((h) => ({ ...h, ...patch }));
    // A field you have changed is no longer marked.
    setErrors((e) => ({
      ...e,
      ...(patch.party && { party: undefined }),
      ...(patch.issueDate && { issueDate: undefined }),
      ...(patch.validityDate && { validityDate: undefined }),
      ...(patch.customFields && { custom: undefined }),
    }));
  };

  const save = useMutation({
    mutationFn: (status: string) => {
      const body = buildPayload({
        header,
        status,
        number: editing ? q?.quotationNumber : chosenSeries?.nextNumber,
        sendSeries: !numbered,
        lines,
        fields,
        extraDiscount,
        isRoundOff,
        deductions: deductions.payload(),
        fallbackUom: SYSTEM_DEFAULTS.DEFAULT_UOM,
      });
      return editing ? updateQuotation(id!, body) : createQuotation(body);
    },
    onSuccess: (saved, status) => {
      void queryClient.invalidateQueries({ queryKey: ['quotations'] });
      if (id) void queryClient.invalidateQueries({ queryKey: ['quotation', id] });
      const number = saved?.quotationNumber ?? q?.quotationNumber ?? chosenSeries?.nextNumber ?? '';
      notify(
        status === QUOTATION_STATUS.DRAFT
          ? `Quotation Draft "${number}" ${editing ? 'updated' : 'saved'} successfully.`
          : status === QUOTATION_STATUS.APPROVER_ACCEPTED
            ? `Quotation "${number}" ${editing ? 'updated' : 'saved'} and approved.`
            : `Quotation "${number}" submitted for approval successfully!`,
      );
      leaving.current = true;
      router.back();
    },
    onError: (e) => {
      setBanner(message(e));
      form.toTop();
    },
  });

  // The web's checks, in its order; the server checks the rest (a number already used, a customer made inactive).
  const submit = (status: string) => {
    const forApproval = status !== QUOTATION_STATUS.DRAFT;
    const head = headerErrors(header, fields, forApproval);
    const lineFail = lineProblem(lines, forApproval);
    setErrors(head);
    setProblem(null);
    setBanner(null);
    // A mistake in a field is shown at that field (the screen scrolls to it); only what has no field of its own goes in the banner.
    if (lineFail) setProblem(lineFail);
    const customKey = head.custom ? Object.keys(head.custom)[0] : undefined;
    const anchor = head.party ? 'party' : head.issueDate ? 'issueDate' : head.validityDate ? 'validityDate' : customKey ? `custom:${customKey}` : lineFail ? `line:${lineFail.key}` : null;
    if (anchor) {
      form.scrollTo(anchor);
      return;
    }
    const noField =
      (!editing && !header.seriesId ? 'Document numbering series is not configured for Quotations. Please configure it first.' : undefined) ?? deductions.missingMessage ?? undefined;
    if (noField) {
      setBanner(noField);
      form.toTop();
      return;
    }
    save.mutate(status);
  };

  const approvalStatus = canApprove ? QUOTATION_STATUS.APPROVER_ACCEPTED : QUOTATION_STATUS.PENDING_APPROVAL;
  const primaryLabel = canApprove ? 'Save & Approve' : returned ? 'Resubmit for Approval' : 'Submit for Approval';
  const pending = save.isPending ? save.variables : null;
  const returnedBy = personName(q?.approvedBy);

  if (sourceId && source.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (sourceId && (source.error || !source.data)) {
    return (
      <Centered>
        <ErrorText message={message(source.error ?? 'Quotation not found')} />
        <Button title="Try again" tone="secondary" onPress={() => void source.refetch()} />
      </Centered>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormScrollProvider value={form.api}>
      <ScrollView ref={form.scrollRef as never} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ScreenTitle
          back={editing ? 'Back' : 'Quotations'}
          title={editing ? 'Edit Quotation' : 'New Quotation'}
          right={
            <SeriesBadge
              options={series.data}
              loading={series.isLoading}
              failed={Boolean(series.error)}
              value={header.seriesId}
              onChange={(seriesId) => change({ seriesId })}
              number={editing ? q?.quotationNumber : undefined}
              locked={numbered}
            />
          }
        />

        {returned && q ? (
          <NoticeBanner
            tone="danger"
            title={`Returned for changes${returnedBy ? ` · by ${returnedBy}` : ''}`}
            body={`${q.approvalRemarks ? `“${q.approvalRemarks}”\n` : ''}Make the changes (see the remarks on the lines too), then press ${primaryLabel}.`}
          />
        ) : null}
        {editingApproved && q ? <NoticeBanner tone="warn" title={DOCUMENT_EDIT_TEXT.editingTitle('Quotation', q.quotationNumber)} body={DOCUMENT_EDIT_TEXT.banner('quotation', canApprove)} /> : null}
        {duplicating && q ? (
          <NoticeBanner title={`Cloned from Quotation: ${q.quotationNumber}`} body={chosenSeries ? `New draft created with sequential series: ${chosenSeries.nextNumber}` : null} />
        ) : null}
        <ErrorBanner message={banner} />

        <HeaderSection
          value={header}
          onChange={change}
          errors={errors}
          customerLock={madeFrom.length ? DOCUMENT_EDIT_TEXT.partyLockedBy('customer', madeFrom) : null}
          billingLocked={numbered}
          footer={
            <SummaryCard totals={totals} exempt={exempt} extraDiscount={extraDiscount} onExtraDiscount={setExtraDiscount} isRoundOff={isRoundOff} onRoundOff={setIsRoundOff} />
          }
        >
          <ItemsSection
            lines={lines}
            onChange={(next) => {
              setLines(next);
              setProblem(null);
            }}
            supplyType={header.supplyType}
            problem={problem}
          />
          <DeductionCard deductions={deductions} values={totals.values} amounts={totals.deductions} />
        </HeaderSection>
      </ScrollView>
      </FormScrollProvider>
      <View style={styles.bar}>
        {/* Edited after approval: it goes for approval again, never back to Draft. */}
        {wasApproved ? null : (
          <Button title="Save Draft" tone="secondary" style={{ flex: 1 }} onPress={() => submit(QUOTATION_STATUS.DRAFT)} busy={pending === QUOTATION_STATUS.DRAFT} disabled={save.isPending} />
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
