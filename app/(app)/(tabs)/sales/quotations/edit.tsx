import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { DEDUCTION_KIND, SYSTEM_DEFAULTS } from 'floman-shared/constants';
import { isZeroRatedSupply } from 'floman-shared/gst';
import { PERMISSIONS } from 'floman-shared/permissions';
import { QUOTATION_STATUS } from 'floman-shared/statuses';
import { documentTotalsWithDeductions } from 'floman-shared/taxDeduction';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/FormParts';
import { ScreenTitle } from '@/components/ScreenTitle';
import { useSession } from '@/features/auth/session';
import { createQuotation } from '@/features/quotations/api';
import { HeaderSection } from '@/features/quotations/components/HeaderSection';
import { ItemsSection } from '@/features/quotations/components/ItemsSection';
import { SeriesBadge } from '@/features/quotations/components/SeriesBadge';
import { SummaryCard } from '@/features/quotations/components/SummaryCard';
import { buildPayload, headerErrors, lineProblem, newHeader, newLine, priced, type FormLine, type HeaderErrors, type QuotationHeader } from '@/features/quotations/form';
import { partRatesForZeroLines } from '@/features/quotations/partRates';
import { useCustomFieldDefs } from '@/features/quotations/useCustomFieldDefs';
import { useQuotationSeries } from '@/features/quotations/useQuotationSeries';
import { DeductionCard } from '@/features/tax/DeductionCard';
import { useDocumentDeductions } from '@/features/tax/useDocumentDeductions';
import { notify } from '@/lib/notify';
import { spacing, useColors, useThemed, type Colors } from '@/theme';

/** A Quotation has the TCS box only (shared/taxDeduction.ts). */
const TCS_BOX = [DEDUCTION_KIND.TCS] as const;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * New Quotation, in the web's order: number and series, Customer & dates (with the custom fields), Items, TDS / TCS,
 * Notes & terms, Summary. Save Draft, and Save & Approve (for someone who may approve) or Submit for Approval.
 */
export default function QuotationForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const { can } = useSession();
  // The ScrollView's own type does not expose scrollTo in this React Native version, so only what is used is typed.
  const scroll = useRef<{ scrollTo: (to: { y: number; animated?: boolean }) => void } | null>(null);

  const [header, setHeader] = useState<QuotationHeader>(newHeader);
  const [lines, setLines] = useState<FormLine[]>(() => [newLine()]);
  const [extraDiscount, setExtraDiscount] = useState('');
  const [isRoundOff, setIsRoundOff] = useState(true);
  const [errors, setErrors] = useState<HeaderErrors>({});
  const [problem, setProblem] = useState<{ key: string; message: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const { fields } = useCustomFieldDefs();
  const series = useQuotationSeries(header.billingLocationId);
  const chosenSeries = series.data?.find((o) => o.id === header.seriesId) ?? null;

  // A place's own series: the default one is chosen when the list arrives (or Bill from changes).
  useEffect(() => {
    if (!series.data) return;
    const chosen = series.data.find((o) => o.id === header.seriesId) ?? series.data.find((o) => o.isDefault) ?? series.data[0] ?? null;
    if ((chosen?.id ?? null) !== header.seriesId) setHeader((h) => ({ ...h, seriesId: chosen?.id ?? null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.data]);
  const deductions = useDocumentDeductions({ kinds: TCS_BOX, vendorId: header.party?.id ?? null, date: header.issueDate || null });
  // Exactly one of the two: who may approve saves it approved, anyone else submits it for approval.
  const canApprove = can(PERMISSIONS.QUOTATIONS.APPROVE);

  const exempt = isZeroRatedSupply(header.supplyType);
  const totals = documentTotalsWithDeductions(lines.map((l) => priced(l, exempt)), Number(extraDiscount) || 0, isRoundOff, deductions.picks, deductions.history);

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
    mutationFn: (status: string) =>
      createQuotation(
        buildPayload({
          header,
          status,
          number: chosenSeries?.nextNumber,
          lines,
          fields,
          extraDiscount,
          isRoundOff,
          deductions: deductions.payload(),
          fallbackUom: SYSTEM_DEFAULTS.DEFAULT_UOM,
        }),
      ),
    onSuccess: (saved, status) => {
      void queryClient.invalidateQueries({ queryKey: ['quotations'] });
      const number = saved?.quotationNumber ?? chosenSeries?.nextNumber ?? '';
      notify(
        status === QUOTATION_STATUS.DRAFT
          ? `Quotation Draft "${number}" saved successfully.`
          : status === QUOTATION_STATUS.APPROVER_ACCEPTED
            ? `Quotation "${number}" saved and approved.`
            : `Quotation "${number}" submitted for approval successfully!`,
      );
      router.back();
    },
    onError: (e) => {
      setBanner(message(e));
      scroll.current?.scrollTo({ y: 0, animated: true });
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
    const first =
      head.party ?? head.issueDate ?? head.validityDate ?? (head.custom ? Object.values(head.custom)[0] : undefined) ??
      (lineFail ? lineFail.message : undefined) ??
      (!header.seriesId ? 'Document numbering series is not configured for Quotations. Please configure it first.' : undefined) ??
      deductions.missingMessage ?? undefined;
    if (first) {
      if (lineFail) setProblem(lineFail);
      setBanner(first);
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    save.mutate(status);
  };

  const approvalStatus = canApprove ? QUOTATION_STATUS.APPROVER_ACCEPTED : QUOTATION_STATUS.PENDING_APPROVAL;
  const pending = save.isPending ? save.variables : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll as never}contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ScreenTitle
          back="Quotations"
          title="New Quotation"
          right={<SeriesBadge options={series.data} loading={series.isLoading} failed={Boolean(series.error)} value={header.seriesId} onChange={(seriesId) => change({ seriesId })} />}
        />
        <ErrorBanner message={banner} />
        <HeaderSection
          value={header}
          onChange={change}
          errors={errors}
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
      <View style={styles.bar}>
        <Button title="Save Draft" tone="secondary" style={{ flex: 1 }} onPress={() => submit(QUOTATION_STATUS.DRAFT)} busy={pending === QUOTATION_STATUS.DRAFT} disabled={save.isPending} />
        <Button
          title={canApprove ? 'Save & Approve' : 'Submit for Approval'}
          style={{ flex: 1 }}
          onPress={() => submit(approvalStatus)}
          busy={pending === approvalStatus}
          disabled={save.isPending}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
