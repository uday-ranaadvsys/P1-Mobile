import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SYSTEM_DEFAULTS } from 'floman-shared/constants';
import { isDraftNumber } from 'floman-shared/documentNumber';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { isUnregistered, SUPPLY_TYPE } from 'floman-shared/gst';
import { PURCHASE_INDENT_STATUS } from 'floman-shared/statuses';
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
import { SeriesBadge } from '@/features/documents/components/SeriesBadge';
import { useCustomFieldDefs } from '@/features/documents/useCustomFieldDefs';
import { useDocumentSeries } from '@/features/documents/useDocumentSeries';
import { lineFromPicked, madeFromIndents, useIndentHandoff } from '@/features/indents/pickedLines';
import { getPartMeta } from '@/features/parts/api';
import { getParty, type Party } from '@/features/parties/api';
import { createPurchaseIndent, getPurchaseIndent, updatePurchaseIndent } from '@/features/purchase-indents/api';
import { buildPayload, EXPECTED_DELIVERY_REQUIRED, formFromPurchaseIndent, type PurchaseIndentHeader } from '@/features/purchase-indents/form';
import { poOf } from '@/features/purchase-indents/text';
import { HeaderSection } from '@/features/purchase-orders/components/HeaderSection';
import { headerErrors, lineProblem, newHeader, withPurchasePart, zeroRated, type HeaderErrors } from '@/features/purchase-orders/form';
import { partRatesForLines } from '@/features/purchase-orders/partRates';
import { ItemsSection } from '@/features/quotations/components/ItemsSection';
import { SummaryCard } from '@/features/quotations/components/SummaryCard';
import { newLine, priced, type FormLine } from '@/features/quotations/form';
import { personName } from '@/features/quotations/text';
import { notify } from '@/lib/notify';
import { spacing, useColors, useThemed, type Colors } from '@/theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One form for a Purchase Indent (a Purchase Order that goes for approval and becomes the PO when approved): number and
 * series (in the title), our places, Vendor & dates (the expected delivery is required; no vendor quote), Items, Notes &
 * terms, Summary. No TDS / TCS: those are on the Purchase Order.
 *  - New: nothing chosen yet, or the lines picked in Manage Indents (`fromIndents`).
 *  - Edit (`id`): a Draft, a returned one, or one waiting for approval (a converted one's order is changed on its PO).
 *  - Duplicate (`duplicateFrom`): a copy, with a new number and new dates.
 * Save Draft and Submit for Approval; a returned one is saved or resubmitted; a waiting one is saved in place.
 */
export default function PurchaseIndentForm() {
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
  const form = useFormScroll();
  const folds = useFolds(editing ? EDIT_FOLDS : NEW_FOLDS);

  const [header, setHeader] = useState<PurchaseIndentHeader>(() => ({ ...newHeader(), ...(handoff?.neededAt ? { billingLocationId: handoff.neededAt, shippingLocationId: handoff.neededAt } : {}) }));
  const [lines, setLines] = useState<FormLine[]>(() => (handoff ? handoff.lines.map(lineFromPicked) : [newLine()]));
  const [extraDiscount, setExtraDiscount] = useState('');
  const [isRoundOff, setIsRoundOff] = useState(true);
  const [errors, setErrors] = useState<HeaderErrors>({});
  const [problem, setProblem] = useState<{ key: string; message: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [ready, setReady] = useState(!sourceId);

  const { fields } = useCustomFieldDefs(DOCUMENT_TYPE.PURCHASE_INDENT);
  const series = useDocumentSeries(DOCUMENT_TYPE.PURCHASE_INDENT, header.billingLocationId);
  const chosenSeries = series.data?.find((o) => o.id === header.seriesId) ?? null;
  const unregistered = isUnregistered(header.party);

  // ── The Purchase Indent being edited or copied ──
  const source = useQuery({
    queryKey: ['purchase-indent-form', sourceId],
    queryFn: async () => {
      const pr = await getPurchaseIndent(sourceId!);
      // Its vendor with its places (someone without Vendors: Read gets the party as the Purchase Indent has it).
      const party = pr.vendor?.id ? await getParty(pr.vendor.id).catch(() => pr.vendor as unknown as Party) : null;
      return { pr, party };
    },
    enabled: Boolean(sourceId),
    gcTime: 0,
  });
  const pr = source.data?.pr;
  const hydrated = useRef(false);
  useEffect(() => {
    if (!source.data || hydrated.current) return;
    hydrated.current = true;
    const { pr: saved, party } = source.data;
    if (editing && ![PURCHASE_INDENT_STATUS.DRAFT, PURCHASE_INDENT_STATUS.RETURNED, PURCHASE_INDENT_STATUS.PENDING_APPROVAL].includes(saved.status as never)) {
      Alert.alert('Cannot edit this Purchase Indent', poOf(saved) ? `It became ${poOf(saved)!.poNumber}: a change to the order is made on the Purchase Order.` : `A ${saved.status.toLowerCase()} Purchase Indent cannot be edited.`);
      router.back();
      return;
    }
    const f = formFromPurchaseIndent(saved, party, duplicating);
    setHeader(f.header);
    setLines(f.lines);
    setExtraDiscount(f.extraDiscount);
    setIsRoundOff(f.isRoundOff);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.data]);

  const returned = editing && pr?.status === PURCHASE_INDENT_STATUS.RETURNED;
  const waiting = editing && pr?.status === PURCHASE_INDENT_STATUS.PENDING_APPROVAL;
  // A numbered one keeps its number and series; a new one or a draft picks its series.
  const numbered = editing && Boolean(pr) && !isDraftNumber(pr!.prNumber);

  // A place's own series: the default one is chosen when the list arrives (or Bill to changes).
  useEffect(() => {
    if (!series.data) return;
    const chosen = series.data.find((o) => o.id === header.seriesId) ?? series.data.find((o) => o.isDefault) ?? series.data[0] ?? null;
    if ((chosen?.id ?? null) !== header.seriesId) setHeader((h) => ({ ...h, seriesId: chosen?.id ?? null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.data]);

  // No TDS / TCS on a Purchase Indent: the totals are the lines, the extra discount and the round off.
  const totals = documentTotalsWithDeductions(lines.map((l) => priced(l, false)), Number(extraDiscount) || 0, isRoundOff, {}, null);
  const itemsSummary = useItemsSummary(lines.filter((l) => l.partName.trim()).length, totals.grandTotal);

  // ── Leaving with changes asks first (the series chosen by default is not a change) ──
  const snapshot = JSON.stringify({ header: { ...header, party: header.party?.id, seriesId: null }, lines, extraDiscount, isRoundOff });
  const baseline = useRef<string | null>(null);
  const leaving = useRef(false);
  useEffect(() => {
    if (ready && baseline.current === null) baseline.current = snapshot;
  });
  const dirty = baseline.current !== null && baseline.current !== snapshot && !handoff;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirty || leaving.current) return;
        e.preventDefault();
        Alert.alert('Leave without saving?', 'Your changes to this purchase indent will be lost.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, dirty],
  );

  const change = (patch: Partial<PurchaseIndentHeader>) => {
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
    setHeader((h) => ({ ...h, ...patch }));
    // A field you have changed is no longer marked.
    setErrors((e) => ({
      ...e,
      ...(patch.party && { party: undefined }),
      ...(patch.orderDate && { orderDate: undefined }),
      ...(patch.expectedDeliveryDate && { expectedDeliveryDate: undefined }),
      ...(patch.customFields && { custom: undefined }),
    }));
  };

  const save = useMutation({
    mutationFn: (status: string) => {
      const body = buildPayload({ header, status, prNumber: editing ? pr?.prNumber : undefined, sendSeries: !numbered, lines, fields, extraDiscount, isRoundOff });
      return editing ? updatePurchaseIndent(id!, body) : createPurchaseIndent(body);
    },
    onSuccess: (saved, status) => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-indents'] });
      void queryClient.invalidateQueries({ queryKey: ['pending-indent-items'] });
      void queryClient.invalidateQueries({ queryKey: ['indents'] });
      if (id) void queryClient.invalidateQueries({ queryKey: ['purchase-indent', id] });
      const number = saved?.prNumber ?? pr?.prNumber ?? chosenSeries?.nextNumber ?? '';
      notify(
        editing
          ? `Purchase Indent "${number}" updated successfully!`
          : status === PURCHASE_INDENT_STATUS.DRAFT
            ? `Purchase Indent "${number}" saved as draft!`
            : `Purchase Indent "${number}" submitted for approval!`,
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
    const head = headerErrors(header, fields);
    if (!header.expectedDeliveryDate) head.expectedDeliveryDate = EXPECTED_DELIVERY_REQUIRED;
    const lineFail = lineProblem(lines);
    setErrors(head);
    setProblem(null);
    setBanner(null);
    // A mistake in a field is shown at that field (the screen scrolls to it).
    if (lineFail) setProblem(lineFail);
    const customKey = head.custom ? Object.keys(head.custom)[0] : undefined;
    const anchor = head.party ? 'party' : head.orderDate ? 'orderDate' : head.expectedDeliveryDate ? 'expectedDeliveryDate' : customKey ? `custom:${customKey}` : lineFail ? `line:${lineFail.key}` : null;
    if (anchor) {
      folds.reveal(anchor, form.scrollTo);
      return;
    }
    save.mutate(status);
  };

  // Draft: Save Draft + Submit. Returned: Save + Resubmit. Waiting: Save changes (it stays waiting, no Draft).
  const sendLabel = returned ? 'Resubmit for Approval' : waiting ? 'Save changes' : 'Submit for Approval';
  const pending = save.isPending ? save.variables : null;
  const returnedBy = personName(pr?.returnedBy);

  if (sourceId && source.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (sourceId && (source.error || !source.data)) {
    return (
      <Centered>
        <ErrorText message={message(source.error ?? 'Purchase Indent not found')} />
        <Button title="Try again" tone="secondary" onPress={() => void source.refetch()} />
      </Centered>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormScrollProvider value={form.api}>
        <ScrollView ref={form.scrollRef as never} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <ScreenTitle
            back={editing ? 'Back' : handoff ? 'Manage Indents' : 'Purchase Indents'}
            title={editing ? 'Edit Purchase Indent' : 'New Purchase Indent'}
            right={
              <SeriesBadge
                docName="Purchase Indent"
                options={series.data}
                loading={series.isLoading}
                failed={Boolean(series.error)}
                value={header.seriesId}
                onChange={(seriesId) => change({ seriesId })}
                number={editing ? pr?.prNumber : undefined}
                locked={numbered}
              />
            }
          />

          {returned && pr ? (
            <NoticeBanner
              tone="danger"
              title={`Returned for changes${returnedBy ? ` · by ${returnedBy}` : ''}`}
              body={`${pr.approvalRemarks ? `“${pr.approvalRemarks}”\n` : ''}Make the changes asked for, then press ${sendLabel}.`}
            />
          ) : null}
          {duplicating && pr ? <NoticeBanner title={`Cloned from Purchase Indent: ${pr.prNumber}`} body={chosenSeries ? `New draft created with sequential series: ${chosenSeries.nextNumber}` : null} /> : null}
          {handoff ? <NoticeBanner title={madeFromIndents(handoff)} /> : null}
          <ErrorBanner message={banner} />

          <HeaderSection
            value={header}
            onChange={change}
            errors={errors}
            folds={folds}
            itemsSummary={itemsSummary}
            documentType={DOCUMENT_TYPE.PURCHASE_INDENT}
            docName="Purchase Indent"
            isPurchaseIndent
            billingLocked={numbered}
            footer={<SummaryCard totals={totals} exempt={false} extraDiscount={extraDiscount} onExtraDiscount={setExtraDiscount} isRoundOff={isRoundOff} onRoundOff={setIsRoundOff} purchase />}
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
              back="Purchase Indent"
              applyPart={(line, part, fallbackRate) => ({ ...withPurchasePart(line, part, fallbackRate, unregistered), indentRef: line.indentRef, indentAllocations: line.indentAllocations })}
            />
          </HeaderSection>
        </ScrollView>
      </FormScrollProvider>
      <View style={styles.bar}>
        {waiting ? null : (
          <Button
            title={returned ? 'Save' : 'Save Draft'}
            tone="secondary"
            style={{ flex: 1 }}
            onPress={() => submit(returned ? PURCHASE_INDENT_STATUS.RETURNED : PURCHASE_INDENT_STATUS.DRAFT)}
            busy={pending === PURCHASE_INDENT_STATUS.DRAFT || pending === PURCHASE_INDENT_STATUS.RETURNED}
            disabled={save.isPending}
          />
        )}
        <Button title={sendLabel} style={{ flex: 1 }} onPress={() => submit(PURCHASE_INDENT_STATUS.PENDING_APPROVAL)} busy={pending === PURCHASE_INDENT_STATUS.PENDING_APPROVAL} disabled={save.isPending} />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
