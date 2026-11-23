import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { isDraftNumber } from 'floman-shared/documentNumber';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { SUPPLY_TYPE } from 'floman-shared/gst';
import { INDENT_STATUS } from 'floman-shared/statuses';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Field } from '@/components/Field';
import { EDIT_FOLDS, FoldCard, NEW_FOLDS, useFolds, useItemsSummary } from '@/components/FoldCard';
import { ErrorBanner, FormCard, NoticeBanner, OptionPills, ReadOnlyField } from '@/components/FormParts';
import { FormScrollProvider, ScrollAnchor, useFormScroll } from '@/components/FormScroll';
import { PickerField } from '@/components/PickerField';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { NotesTermsSection } from '@/features/documents/components/NotesTermsSection';
import { ProjectFields } from '@/features/documents/components/ProjectFields';
import { SeriesBadge } from '@/features/documents/components/SeriesBadge';
import { useCompanyLocations } from '@/features/documents/useCompanyLocations';
import { useDocumentSeries } from '@/features/documents/useDocumentSeries';
import { createIndent, getIndent, updateIndent } from '@/features/indents/api';
import { buildPayload, formFromIndent, headerErrors, newHeader, requiredInDays, requiredText, withIndentPart, type HeaderErrors, type IndentHeader } from '@/features/indents/form';
import { PRIORITY_CHOICES } from '@/features/indents/text';
import { lineProblem } from '@/features/purchase-orders/form';
import { ItemsSection } from '@/features/quotations/components/ItemsSection';
import { newLine, priced, type FormLine } from '@/features/quotations/form';
import { itemAmounts } from 'floman-shared/documentTotals';
import { personName } from '@/features/quotations/text';
import { listDepartments } from '@/features/users/api';
import { formatMoney } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One form for an Indent, in the web's order: number and series (in the title), Department & dates (with the project),
 * Items (quantity and an estimated rate), Notes & terms, and the estimated total.
 *  - New: your own department is chosen when you have one.
 *  - Edit (`id`): a Draft or a returned one (no edit once submitted).
 *  - Duplicate (`duplicateFrom`): a copy of a submitted or answered one, with a new number and a new required-by date.
 * Save Draft, and Submit Indent (Resubmit Indent when it was returned). Leaving with changes asks first.
 */
export default function IndentForm() {
  const { id, duplicateFrom } = useLocalSearchParams<{ id?: string; duplicateFrom?: string }>();
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
  const hide = useHide();
  const { user } = useSession() as unknown as { user?: { departmentId?: string | null; department?: { id?: string } | null } | null };
  const form = useFormScroll();
  const folds = useFolds(editing ? EDIT_FOLDS : NEW_FOLDS);

  const [header, setHeader] = useState<IndentHeader>(() => newHeader());
  const [lines, setLines] = useState<FormLine[]>(() => [newLine()]);
  const [errors, setErrors] = useState<HeaderErrors>({});
  const [problem, setProblem] = useState<{ key: string; message: string } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [ready, setReady] = useState(!sourceId);

  const departments = useQuery({ queryKey: ['departments'], queryFn: listDepartments, retry: false });
  const locations = useCompanyLocations();
  const series = useDocumentSeries(DOCUMENT_TYPE.INDENT, header.shippingLocationId);
  const chosenSeries = series.data?.find((o) => o.id === header.seriesId) ?? null;

  // A new Indent starts in the requester's own department (when it is one of the active ones).
  const ownDepartment = user?.departmentId || user?.department?.id || '';
  useEffect(() => {
    if (sourceId || header.departmentId || !ownDepartment || !departments.data?.some((d) => d.id === ownDepartment)) return;
    setHeader((h) => (h.departmentId ? h : { ...h, departmentId: ownDepartment }));
  }, [sourceId, header.departmentId, ownDepartment, departments.data]);

  // ── The Indent being edited or copied ──
  const source = useQuery({ queryKey: ['indent-form', sourceId], queryFn: () => getIndent(sourceId!), enabled: Boolean(sourceId), gcTime: 0 });
  const indent = source.data;
  const hydrated = useRef(false);
  useEffect(() => {
    if (!source.data || hydrated.current) return;
    hydrated.current = true;
    const saved = source.data;
    if (duplicating && saved.status === INDENT_STATUS.DRAFT) {
      Alert.alert('Draft Indents cannot be duplicated', 'Only submitted or answered Indents can be duplicated.');
      router.back();
      return;
    }
    if (editing && ![INDENT_STATUS.DRAFT, INDENT_STATUS.RETURNED].includes(saved.status as never)) {
      Alert.alert('Cannot edit this Indent', 'An Indent cannot be changed once it is submitted. Return it (a buyer) or raise a new Indent.');
      router.back();
      return;
    }
    const f = formFromIndent(saved, duplicating);
    setHeader(f.header);
    setLines(f.lines);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.data]);

  const returned = editing && indent?.status === INDENT_STATUS.RETURNED;
  // A numbered Indent keeps its number and series; a new one or a draft picks its series.
  const numbered = editing && Boolean(indent) && !isDraftNumber(indent!.indentNumber);

  // A place's own series: the default one is chosen when the list arrives (or Needed at changes).
  useEffect(() => {
    if (!series.data) return;
    const chosen = series.data.find((o) => o.id === header.seriesId) ?? series.data.find((o) => o.isDefault) ?? series.data[0] ?? null;
    if ((chosen?.id ?? null) !== header.seriesId) setHeader((h) => ({ ...h, seriesId: chosen?.id ?? null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.data]);

  // An Indent has estimated rates only: the total is quantity × rate, no GST or discount.
  const total = lines.reduce((sum, l) => sum + itemAmounts(priced(l, true)).totalWithTax, 0);
  const itemsSummary = useItemsSummary(lines.filter((l) => l.partName.trim()).length, total);
  const days = requiredInDays(header);

  // ── Leaving with changes asks first (the series chosen by default is not a change) ──
  const snapshot = JSON.stringify({ header: { ...header, seriesId: null }, lines });
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
        Alert.alert('Leave without saving?', 'Your changes to this indent will be lost.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation, dirty],
  );

  const change = (patch: Partial<IndentHeader>) => {
    setHeader((h) => ({ ...h, ...patch }));
    // A field you have changed is no longer marked.
    setErrors((e) => ({ ...e, ...(patch.departmentId && { department: undefined }), ...(patch.requiredByDate && { requiredByDate: undefined }) }));
  };

  const save = useMutation({
    mutationFn: (status: string) => {
      const body = buildPayload({ header, status, sendSeries: !numbered, lines });
      return editing ? updateIndent(id!, body) : createIndent(body);
    },
    onSuccess: (saved, status) => {
      void queryClient.invalidateQueries({ queryKey: ['indents'] });
      void queryClient.invalidateQueries({ queryKey: ['pending-indent-items'] });
      if (id) void queryClient.invalidateQueries({ queryKey: ['indent', id] });
      const number = saved?.indentNumber ?? indent?.indentNumber ?? chosenSeries?.nextNumber ?? '';
      notify(
        editing
          ? status === INDENT_STATUS.SUBMITTED
            ? 'Indent submitted for procurement successfully!'
            : 'Indent draft updated successfully!'
          : status === INDENT_STATUS.SUBMITTED
            ? `Indent "${number}" submitted successfully!`
            : `Indent "${number}" saved as draft!`,
      );
      leaving.current = true;
      router.back();
    },
    onError: (e) => {
      setBanner(message(e));
      form.toTop();
    },
  });

  // The web's checks, in its order; the server checks the rest.
  const submit = (status: string) => {
    const head = headerErrors(header);
    const lineFail = lineProblem(lines);
    setErrors(head);
    setProblem(null);
    setBanner(null);
    if (lineFail) setProblem(lineFail);
    const anchor = head.department ? 'department' : head.requiredByDate ? 'requiredByDate' : lineFail ? `line:${lineFail.key}` : null;
    if (anchor) {
      folds.reveal(anchor, form.scrollTo);
      return;
    }
    save.mutate(status);
  };

  const primaryLabel = returned ? 'Resubmit Indent' : 'Submit Indent';
  const pending = save.isPending ? save.variables : null;
  const returnedBy = personName(indent?.returnedBy);

  if (sourceId && source.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (sourceId && (source.error || !source.data)) {
    return (
      <Centered>
        <ErrorText message={message(source.error ?? 'Indent not found')} />
        <Button title="Try again" tone="secondary" onPress={() => void source.refetch()} />
      </Centered>
    );
  }

  const placeOptions = [{ value: '', label: 'Registered address' }, ...locations.map((l) => ({ value: l.id, label: l.name }))];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormScrollProvider value={form.api}>
        <ScrollView ref={form.scrollRef as never} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <ScreenTitle
            back={editing ? 'Back' : 'Indents'}
            title={editing ? 'Edit Indent' : 'New Indent'}
            right={
              <SeriesBadge
                docName="Indent"
                options={series.data}
                loading={series.isLoading}
                failed={Boolean(series.error)}
                value={header.seriesId}
                onChange={(seriesId) => change({ seriesId })}
                number={editing ? indent?.indentNumber : undefined}
                locked={numbered}
              />
            }
          />

          {returned && indent ? (
            <NoticeBanner
              tone="danger"
              title={`Returned for changes${returnedBy ? ` · by ${returnedBy}` : ''}`}
              body={`${indent.approverRemarks ? `“${indent.approverRemarks}”\n` : ''}Make the changes asked for, then press ${primaryLabel}.`}
            />
          ) : null}
          {duplicating && indent ? (
            <NoticeBanner title={`Cloned from Indent: ${indent.indentNumber}`} body={chosenSeries ? `New draft created with sequential series: ${chosenSeries.nextNumber}` : null} />
          ) : null}
          <ErrorBanner message={banner} />

          {/* Where it is needed: only once the company has locations besides its registered address. */}
          {locations.length > 0 ? (
            <FormCard>
              <PickerField label="Needed at" value={header.shippingLocationId} options={placeOptions} disabled={numbered} onChange={(shippingLocationId) => change({ shippingLocationId })} />
            </FormCard>
          ) : null}

          <FoldCard
            title="Department & dates"
            summary={[departments.data?.find((d) => d.id === header.departmentId)?.name, header.requiredByDate && `Required by ${header.requiredByDate}`].filter(Boolean).join(' · ') || 'Not filled in yet'}
            open={folds.open.vendor}
            onToggle={() => folds.toggle('vendor')}
          >
            <ScrollAnchor name="department">
              <PickerField
                label="Department"
                required
                value={header.departmentId}
                placeholder="Select the department…"
                options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
                error={errors.department}
                onChange={(departmentId) => change({ departmentId })}
              />
            </ScrollAnchor>

            <View style={{ gap: spacing.xs }}>
              <Text style={styles.label}>Priority<Text style={{ color: colors.danger }}> *</Text></Text>
              <OptionPills options={PRIORITY_CHOICES as { value: string; label: string }[]} value={header.priority} onChange={(priority) => change({ priority })} label="Priority" />
            </View>

            <ReadOnlyField label="Requested Date" text={hide.text(new Date(indent?.createdAt ?? Date.now()).toLocaleDateString('en-GB'))} />
            <ScrollAnchor name="requiredByDate">
              <DateField
                label={days !== null ? `Required By Date · ${requiredText(days)}` : 'Required By Date'}
                required
                value={header.requiredByDate}
                onChange={(requiredByDate) => change({ requiredByDate })}
                error={errors.requiredByDate}
              />
            </ScrollAnchor>
            <Field label="Reference" value={header.reference} onChangeText={(reference) => change({ reference })} placeholder="Work order or request slip number" maxLength={200} autoCapitalize="sentences" />
            <ProjectFields client={false} value={header} onChange={change} />
          </FoldCard>

          <FoldCard title="Items" summary={itemsSummary} open={folds.open.items} onToggle={() => folds.toggle('items')}>
            <ItemsSection
              lines={lines}
              onChange={(next) => {
                setLines(next);
                setProblem(null);
              }}
              supplyType={SUPPLY_TYPE.B2B}
              problem={problem}
              hideTitle
              indent
              back="Indent"
              applyPart={(line, part) => withIndentPart(line, part)}
            />
          </FoldCard>

          <NotesTermsSection
            fold={{ open: folds.open.notes, onToggle: () => folds.toggle('notes') }}
            documentType={DOCUMENT_TYPE.INDENT}
            notes={header.notes}
            terms={header.terms}
            notesPlaceholder="Why it is needed, breakdown context, urgency, storage requirements…"
            termsPlaceholder="Material handling, compliance or QA inspection notes…"
            onChange={change}
          />

          <FormCard>
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Lines</Text>
              <Text style={styles.sumValue}>{lines.filter((l) => l.partName.trim()).length}</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.sumTotal}>Estimated total</Text>
              <Text style={styles.sumTotal}>{hide.hidden ? hide.rupees(0) : formatMoney(total)}</Text>
            </View>
          </FormCard>
        </ScrollView>
      </FormScrollProvider>
      <View style={styles.bar}>
        {/* A returned Indent is resubmitted; a draft can be saved again as a draft. */}
        {returned ? null : <Button title="Save Draft" tone="secondary" style={{ flex: 1 }} onPress={() => submit(INDENT_STATUS.DRAFT)} busy={pending === INDENT_STATUS.DRAFT} disabled={save.isPending} />}
        <Button title={primaryLabel} style={{ flex: 1 }} onPress={() => submit(INDENT_STATUS.SUBMITTED)} busy={pending === INDENT_STATUS.SUBMITTED} disabled={save.isPending} />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
    sumLabel: { ...type.subhead, color: c.muted },
    sumValue: { ...type.subhead, fontWeight: '600', color: c.ink },
    sumTotal: { ...type.headline, color: c.ink },
  });
