import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PART_TYPE, TAX_MODE, VALIDATION_REGEX } from 'floman-shared/constants';
import { convertPriceOnModeChange, priceBothWays, type TaxMode } from 'floman-shared/priceConversion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ErrorBanner, FormCard, OptionPills, SectionHeader } from '@/components/FormParts';
import { PickerField } from '@/components/PickerField';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { createPart, getPart, getPartMeta, updatePart, type Part, type PartInput } from '@/features/parts/api';
import { formatMoney } from '@/lib/format';
import { notify } from '@/lib/notify';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const MODES = [
  { value: TAX_MODE.WITHOUT_TAX, label: 'Without Tax' },
  { value: TAX_MODE.WITH_TAX, label: 'With Tax' },
];

type Errors = Partial<Record<'partType' | 'name' | 'uom' | 'taxRateId' | 'hsn' | 'inStock' | 'minStock', string>>;

/**
 * Add or edit a part: the web's form (client features/parts/forms/PartForm.tsx) for a phone. Type, name and unit,
 * group, opening stock (new) or stock in hand (read-only), minimum stock; prices with or without GST; the GST rate
 * and HSN / SAC code; notes. Like the web, nothing is chosen for you: the type, unit and GST rate start empty.
 *
 * Used by the Part Master screens and, in a full-screen sheet, by the Quotation's items (the web's "New part" /
 * "Edit part"): `back` names where Cancel and the back link go, `onDone` gets the saved part, `onCancel` leaves.
 */
export function PartForm({ id, back, onDone, onCancel }: { id?: string; back: string; onDone: (saved: Part) => void; onCancel: () => void }) {
  const editing = Boolean(id);
  const queryClient = useQueryClient();
  const styles = useThemed(makeStyles);
  const colors = useColors();

  const [partType, setPartType] = useState('');
  const [name, setName] = useState('');
  const [uom, setUom] = useState('');
  const [groupId, setGroupId] = useState('');
  const [openingStock, setOpeningStock] = useState('');
  const [stockInHand, setStockInHand] = useState('');
  const [minStock, setMinStock] = useState('');
  const [selling, setSelling] = useState('');
  const [sellingMode, setSellingMode] = useState<TaxMode>(TAX_MODE.WITHOUT_TAX);
  const [purchase, setPurchase] = useState('');
  const [purchaseMode, setPurchaseMode] = useState<TaxMode>(TAX_MODE.WITHOUT_TAX);
  const [taxRateId, setTaxRateId] = useState('');
  const [hsn, setHsn] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);

  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);

  const meta = useQuery({ queryKey: ['part-meta'], queryFn: getPartMeta });
  const taxRates = meta.data?.taxRates ?? [];
  const taxPct = Number(taxRates.find((t) => String(t.id) === taxRateId)?.percentage ?? 0);

  // An existing part fills the form once, when it and the rate list have arrived.
  const loaded = useRef(false);
  const { data: part, error: loadError, isLoading, refetch } = useQuery({ queryKey: ['part', id], queryFn: () => getPart(id!), enabled: editing });
  useEffect(() => {
    if (!part || !meta.data || loaded.current) return;
    loaded.current = true;
    const text = (v: number | null | undefined) => (v !== null && v !== undefined ? String(Number(v)) : '');
    setPartType(part.partType);
    setName(part.name);
    setUom(part.uom);
    setGroupId(part.classifications?.[0]?.id ?? '');
    setStockInHand(part.inStock !== null && part.inStock !== undefined ? String(Number(part.inStock)) : '0');
    setMinStock(text(part.minStock as number | null));
    // Both prices are shown before tax (as stored); either can be switched to "With Tax".
    setSelling(text(part.sellingPriceWithoutTax));
    setPurchase(text(part.purchasePriceWithoutTax));
    const matched = part.taxRateId ?? meta.data.taxRates.find((t) => Number(t.percentage) === Number(part.defaultTax))?.id;
    setTaxRateId(matched ? String(matched) : '');
    setHsn(part.hsn ?? '');
    setDescription(part.description ?? '');
    setActive(part.isActive);
  }, [part, meta.data]);

  const product = partType !== PART_TYPE.SERVICE;

  // Switching With / Without Tax converts the amount, so the price itself stays the same.
  const changeMode = (which: 'selling' | 'purchase', next: TaxMode) => {
    const current = which === 'selling' ? sellingMode : purchaseMode;
    const value = which === 'selling' ? selling : purchase;
    if (next === current) return;
    const amount = parseFloat(value || '');
    if (!isNaN(amount) && amount > 0) {
      const converted = String(convertPriceOnModeChange(amount, current, next, taxPct));
      if (which === 'selling') setSelling(converted);
      else setPurchase(converted);
    }
    if (which === 'selling') setSellingMode(next);
    else setPurchaseMode(next);
  };

  const sellingAmount = parseFloat(selling || '');
  const purchaseAmount = parseFloat(purchase || '');
  const half = taxPct / 2;
  const gstSplit = taxPct > 0 ? `${half}% CGST + ${half}% SGST, or ${taxPct}% IGST` : 'No GST';
  const breakdown = (label: string, amount: number, mode: TaxMode) => {
    if (isNaN(amount) || amount <= 0) return null;
    const price = priceBothWays(amount, mode, taxPct);
    return (
      <Text key={label} style={styles.help}>
        {label}: {formatMoney(price.withoutTax)} + {formatMoney(price.withTax - price.withoutTax)} GST = <Text style={styles.bold}>{formatMoney(price.withTax)}</Text>
      </Text>
    );
  };

  const save = useMutation({
    mutationFn: () => {
      // Each price as typed, With Tax (GST included) or Without Tax, stored both ways.
      const both = (typed: string, mode: TaxMode) => {
        const amount = parseFloat(typed || '');
        return !isNaN(amount) && amount >= 0 ? priceBothWays(amount, mode, taxPct) : null;
      };
      const sell = both(selling, sellingMode);
      const buy = both(purchase, purchaseMode);
      const parsedStock = !product ? null : openingStock.trim() ? parseFloat(openingStock) : 0;
      const input: PartInput = {
        partType,
        name: name.trim(),
        description: description.trim() || null,
        hsn: hsn.trim() || null,
        // Opening stock on a new part only: an edit never sends it (GRNs and challans move it meanwhile).
        ...(!editing && { inStock: parsedStock === null ? null : isNaN(parsedStock) ? 0 : parsedStock }),
        minStock: !product || !minStock.trim() ? null : Number(minStock),
        classificationIds: groupId ? [groupId] : [],
        taxRateId: taxRateId ? Number(taxRateId) : null,
        sellingPriceWithoutTax: sell?.withoutTax ?? 0,
        sellingPriceWithTax: sell?.withTax ?? 0,
        purchasePriceWithoutTax: buy?.withoutTax ?? null,
        purchasePriceWithTax: buy?.withTax ?? null,
        defaultTax: taxPct,
        uom: uom || 'NOS',
        isActive: editing ? active : true,
      };
      return editing ? updatePart(id!, input) : createPart(input);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['parts'] });
      if (id) void queryClient.invalidateQueries({ queryKey: ['part', id] });
      notify(editing ? `${name.trim()} saved.` : `${name.trim()} added to Part Master.`);
      onDone(saved);
    },
    onError: (e) => setBanner(message(e)),
  });

  // The web form's own checks, in its words; the server checks the rest (a name already used, a missing code).
  const submit = () => {
    const next: Errors = {};
    if (partType !== PART_TYPE.PRODUCT && partType !== PART_TYPE.SERVICE) next.partType = 'Please select whether this is a Product or a Service';
    if (name.trim().length < 2) next.name = 'Part name must be at least 2 characters';
    else if (name.trim().length > 255) next.name = 'Part name cannot exceed 255 characters';
    if (!uom) next.uom = 'Unit of measure is required';
    if (!taxRateId) next.taxRateId = 'Tax percentage is required';
    if (!hsn.trim()) next.hsn = partType === PART_TYPE.SERVICE ? 'SAC code is needed for services (GST invoices and returns use it)' : 'HSN code is needed for products (GST invoices and returns use it)';
    else if (!VALIDATION_REGEX.HSN.test(hsn)) next.hsn = 'HSN/SAC Code must be exactly 4, 6, or 8 digits';
    if (!editing && openingStock.trim() && isNaN(Number(openingStock))) next.inStock = 'In Stock quantity must be a number';
    if (minStock.trim() && (isNaN(Number(minStock)) || Number(minStock) < 0)) next.minStock = 'Minimum stock must be 0 or more';
    setErrors(next);
    setBanner(null);
    if (Object.keys(next).length === 0) save.mutate();
  };

  const uomOptions = useMemo(() => (meta.data?.uoms ?? []).map((u) => ({ value: u.code, label: u.name && u.name !== u.code ? `${u.code} - ${u.name}` : u.code })), [meta.data]);
  const groupOptions = useMemo(() => [{ value: '', label: 'None' }, ...(meta.data?.classifications ?? []).map((g) => ({ value: g.id, label: g.name }))], [meta.data]);
  const rateOptions = taxRates.map((t) => ({ value: String(t.id), label: `${Number(t.percentage)}%` }));

  if ((editing && isLoading) || meta.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if ((editing && (loadError || !part)) || meta.error) {
    return (
      <Centered>
        <ErrorText message={message(loadError ?? meta.error)} />
        <Button title="Try again" tone="secondary" onPress={() => void (meta.error ? meta.refetch() : refetch())} />
      </Centered>
    );
  }

  const priceBox = (which: 'selling' | 'purchase') => (
    <View style={{ gap: spacing.sm }}>
      <Field
        label={which === 'selling' ? 'Selling price' : 'Purchase price'}
        prefix="₹"
        value={which === 'selling' ? selling : purchase}
        onChangeText={(v) => (which === 'selling' ? setSelling(v.replace(/[^0-9.]/g, '')) : setPurchase(v.replace(/[^0-9.]/g, '')))}
        placeholder="0.00"
        keyboardType="decimal-pad"
      />
      <OptionPills<TaxMode>
        label={`${which === 'selling' ? 'Selling' : 'Purchase'} price: with or without tax`}
        value={which === 'selling' ? sellingMode : purchaseMode}
        onChange={(m) => changeMode(which, m)}
        options={MODES as { value: TaxMode; label: string }[]}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ScreenTitle back={back} onBack={onCancel} title={editing ? 'Edit Part' : 'New Part'} />
        <ErrorBanner message={banner} />

        <View>
          <SectionHeader>Basics</SectionHeader>
          <FormCard>
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.label}>
                Type<Text style={{ color: colors.danger }}> *</Text>
              </Text>
              <OptionPills
                label="Type"
                value={partType}
                onChange={(t) => {
                  setPartType(t);
                  setErrors((e) => ({ ...e, partType: undefined }));
                }}
                options={[
                  { value: PART_TYPE.PRODUCT, label: 'Product' },
                  { value: PART_TYPE.SERVICE, label: 'Service' },
                ]}
              />
              {errors.partType ? <Text style={[styles.error, { color: colors.danger }]}>{errors.partType}</Text> : null}
            </View>
            <Field label="Part name" required value={name} onChangeText={setName} placeholder="e.g. Turbine Housing Assembly" autoCapitalize="words" error={errors.name} />
            <PickerField label="Unit" required value={uom} options={uomOptions} onChange={setUom} error={errors.uom} searchable />
            <PickerField label="Group" value={groupId} options={groupOptions} onChange={setGroupId} placeholder="None" />
            <Text style={styles.help}>Parts in a Sales Order group won't show up when raising an indent.</Text>
            {product ? (
              editing ? (
                <View style={{ gap: 2 }}>
                  <Text style={styles.label}>Stock in hand</Text>
                  <Text style={styles.body}>{stockInHand} {uom}</Text>
                  <Text style={styles.help}>Changes through GRN, challans or an adjustment.</Text>
                </View>
              ) : (
                <Field label="Opening stock" value={openingStock} onChangeText={(v) => setOpeningStock(v.replace(/[^0-9.-]/g, ''))} placeholder="0" keyboardType="numbers-and-punctuation" error={errors.inStock} />
              )
            ) : null}
            {product ? (
              <View style={{ gap: spacing.xs }}>
                <Field label="Minimum stock" value={minStock} onChangeText={(v) => setMinStock(v.replace(/[^0-9.]/g, ''))} placeholder="None" keyboardType="decimal-pad" error={errors.minStock} />
                {!errors.minStock ? <Text style={styles.help}>Below this it shows as low stock in Part Master.</Text> : null}
              </View>
            ) : null}
          </FormCard>
        </View>

        <View>
          <SectionHeader>Price & tax</SectionHeader>
          <FormCard>
            {priceBox('selling')}
            {priceBox('purchase')}
            <PickerField label="GST rate" required value={taxRateId} options={rateOptions} onChange={(v) => { setTaxRateId(v); setErrors((e) => ({ ...e, taxRateId: undefined })); }} error={errors.taxRateId} />
            {!errors.taxRateId ? <Text style={styles.help}>{gstSplit}</Text> : null}
            <View style={{ gap: spacing.xs }}>
              <Field
                label={product ? 'HSN code' : 'SAC code'}
                required
                value={hsn}
                onChangeText={(v) => setHsn(v.replace(/\D/g, '').slice(0, 8))}
                placeholder="e.g. 8411"
                keyboardType="number-pad"
                maxLength={8}
                error={errors.hsn}
              />
              {!errors.hsn && !hsn ? <Text style={[styles.help, { color: colors.warnText }]}>Needed on GST invoices</Text> : null}
              <Pressable onPress={() => void Linking.openURL('https://services.gst.gov.in/services/searchhsnsac')} accessibilityRole="link" style={styles.link}>
                <Text style={[styles.linkText, { color: colors.brandText }]}>Find HSN</Text>
              </Pressable>
            </View>
            {(!isNaN(sellingAmount) && sellingAmount > 0) || (!isNaN(purchaseAmount) && purchaseAmount > 0) ? (
              <View style={styles.breakdown}>
                {breakdown('Selling', sellingAmount, sellingMode)}
                {breakdown('Purchase', purchaseAmount, purchaseMode)}
              </View>
            ) : null}
          </FormCard>
        </View>

        <View>
          <SectionHeader>Notes</SectionHeader>
          <FormCard>
            <Field label="Notes" value={description} onChangeText={setDescription} placeholder="Material grade, tolerance, finish…" multiline autoCapitalize="sentences" />
          </FormCard>
        </View>
      </ScrollView>

      <View style={styles.bar}>
        <Button title="Cancel" tone="secondary" style={{ flex: 1 }} onPress={onCancel} disabled={save.isPending} />
        <Button title={editing ? 'Save' : 'Add'} style={{ flex: 1 }} onPress={submit} busy={save.isPending} />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    body: { ...type.body, color: c.ink },
    help: { ...type.footnote, color: c.muted },
    bold: { fontWeight: '700', color: c.ink },
    error: { ...type.footnote },
    link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
    linkText: { ...type.subhead, fontWeight: '600' },
    breakdown: { backgroundColor: c.background, borderRadius: 12, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.xs },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
