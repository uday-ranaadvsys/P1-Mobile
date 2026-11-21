import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { DEDUCTION_KIND_ORDER, DEDUCTION_SIDE, SYSTEM_DEFAULTS } from 'floman-shared/constants';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { isUnregistered, SUPPLY_TYPE } from 'floman-shared/gst';
import { PERMISSIONS } from 'floman-shared/permissions';
import { PO_STATUS } from 'floman-shared/statuses';
import { documentTotalsWithDeductions } from 'floman-shared/taxDeduction';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/FormParts';
import { FormScrollProvider, useFormScroll } from '@/components/FormScroll';
import { ScreenTitle } from '@/components/ScreenTitle';
import { useSession } from '@/features/auth/session';
import { SeriesBadge } from '@/features/documents/components/SeriesBadge';
import { useCustomFieldDefs } from '@/features/documents/useCustomFieldDefs';
import { useDocumentSeries } from '@/features/documents/useDocumentSeries';
import { getPartMeta } from '@/features/parts/api';
import { createPurchaseOrder } from '@/features/purchase-orders/api';
import { HeaderSection } from '@/features/purchase-orders/components/HeaderSection';
import { buildPayload, headerErrors, lineProblem, newHeader, withPurchasePart, zeroRated, type HeaderErrors, type PurchaseOrderHeader } from '@/features/purchase-orders/form';
import { partRatesForLines } from '@/features/purchase-orders/partRates';
import { ItemsSection } from '@/features/quotations/components/ItemsSection';
import { SummaryCard } from '@/features/quotations/components/SummaryCard';
import { newLine, priced, type FormLine } from '@/features/quotations/form';
import { DeductionCard } from '@/features/tax/DeductionCard';
import { useDocumentDeductions } from '@/features/tax/useDocumentDeductions';
import { notify } from '@/lib/notify';
import { spacing, useColors, useThemed, type Colors } from '@/theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * New Purchase Order, in the web's order: number and series (in the title), our places, Vendor & dates (with the custom
 * fields), Items, TDS / TCS, Notes & terms, Summary. Save Draft, and Save & Approve (for someone who may approve) or
 * Submit for Approval. Leaving with changes asks first. Edit, Duplicate and Cancel come in the next step.
 */
export default function PurchaseOrderForm() {
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

  const [header, setHeader] = useState<PurchaseOrderHeader>(newHeader);
  const [lines, setLines] = useState<FormLine[]>(() => [newLine()]);
  const [extraDiscount, setExtraDiscount] = useState('');
  const [isRoundOff, setIsRoundOff] = useState(true);
  const [errors, setErrors] = useState<HeaderErrors>({});
  const [problem, setProblem] = useState<{ key: string; message: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const { fields } = useCustomFieldDefs(DOCUMENT_TYPE.PURCHASE_ORDER);
  const series = useDocumentSeries(DOCUMENT_TYPE.PURCHASE_ORDER, header.billingLocationId);
  const chosenSeries = series.data?.find((o) => o.id === header.seriesId) ?? null;
  // A purchase has all three boxes: TCS, GST-TDS and TDS.
  const deductions = useDocumentDeductions({ kinds: DEDUCTION_KIND_ORDER, side: DEDUCTION_SIDE.PURCHASE, vendorId: header.party?.id ?? null, date: header.orderDate || null });
  const canApprove = can(PERMISSIONS.PURCHASE_ORDERS.APPROVE);
  const unregistered = isUnregistered(header.party);

  // A place's own series: the default one is chosen when the list arrives (or Bill to changes).
  useEffect(() => {
    if (!series.data) return;
    const chosen = series.data.find((o) => o.id === header.seriesId) ?? series.data.find((o) => o.isDefault) ?? series.data[0] ?? null;
    if ((chosen?.id ?? null) !== header.seriesId) setHeader((h) => ({ ...h, seriesId: chosen?.id ?? null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.data]);

  const totals = documentTotalsWithDeductions(lines.map((l) => priced(l, false)), Number(extraDiscount) || 0, isRoundOff, deductions.picks, deductions.history);

  // ── Leaving with changes asks first (the series chosen by default is not a change) ──
  const snapshot = JSON.stringify({ header: { ...header, party: header.party?.id, seriesId: null }, lines, extraDiscount, isRoundOff, deduction: [deductions.ticked, deductions.sectionIds] });
  const baseline = useRef<string | null>(null);
  const leaving = useRef(false);
  useEffect(() => {
    if (baseline.current === null) baseline.current = snapshot;
  });
  const dirty = baseline.current !== null && baseline.current !== snapshot;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirty || leaving.current) return;
        e.preventDefault();
        Alert.alert('Leave without saving?', 'Your changes to this purchase order will be lost.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, dirty],
  );

  const change = (patch: Partial<PurchaseOrderHeader>) => {
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
      ...(patch.customFields && { custom: undefined }),
    }));
  };

  const save = useMutation({
    mutationFn: (status: string) =>
      createPurchaseOrder(buildPayload({ header, status, sendSeries: true, lines, fields, extraDiscount, isRoundOff, deductions: deductions.payload() })),
    onSuccess: (saved, status) => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      const number = saved?.poNumber ?? chosenSeries?.nextNumber ?? '';
      notify(
        status === PO_STATUS.DRAFT
          ? `Purchase Order "${number}" saved as draft!`
          : status === PO_STATUS.PENDING_APPROVAL
            ? `Purchase Order "${number}" submitted for approval!`
            : `Purchase Order "${number}" approved.`,
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
    const lineFail = lineProblem(lines);
    setErrors(head);
    setProblem(null);
    setBanner(null);
    // A mistake in a field is shown at that field (the screen scrolls to it); only what has no field of its own goes in the banner.
    if (lineFail) setProblem(lineFail);
    const customKey = head.custom ? Object.keys(head.custom)[0] : undefined;
    const anchor = head.party ? 'party' : lineFail ? `line:${lineFail.key}` : deductions.missingMessage ? null : head.orderDate ? 'orderDate' : customKey ? `custom:${customKey}` : null;
    if (anchor) {
      form.scrollTo(anchor);
      return;
    }
    if (deductions.missingMessage) {
      setBanner(deductions.missingMessage);
      form.toTop();
      return;
    }
    save.mutate(status);
  };

  const approvalStatus = canApprove ? PO_STATUS.APPROVED : PO_STATUS.PENDING_APPROVAL;
  const pending = save.isPending ? save.variables : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormScrollProvider value={form.api}>
      <ScrollView ref={form.scrollRef as never} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ScreenTitle
          back="Purchase Orders"
          title="New Purchase Order"
          right={
            <SeriesBadge
              docName="Purchase Order"
              options={series.data}
              loading={series.isLoading}
              failed={Boolean(series.error)}
              value={header.seriesId}
              onChange={(seriesId) => change({ seriesId })}
            />
          }
        />
        <ErrorBanner message={banner} />
        <HeaderSection
          value={header}
          onChange={change}
          errors={errors}
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
            back="Purchase Order"
            applyPart={(line, part, fallbackRate) => withPurchasePart(line, part, fallbackRate, unregistered)}
          />
          <DeductionCard deductions={deductions} values={totals.values} amounts={totals.deductions} />
        </HeaderSection>
      </ScrollView>
      </FormScrollProvider>
      <View style={styles.bar}>
        <Button title="Save Draft" tone="secondary" style={{ flex: 1 }} onPress={() => submit(PO_STATUS.DRAFT)} busy={pending === PO_STATUS.DRAFT} disabled={save.isPending} />
        <Button title={canApprove ? 'Save & Approve' : 'Submit for Approval'} style={{ flex: 1 }} onPress={() => submit(approvalStatus)} busy={pending === approvalStatus} disabled={save.isPending} />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
