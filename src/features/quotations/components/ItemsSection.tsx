import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DISCOUNT_TYPE, SYSTEM_DEFAULTS } from 'floman-shared/constants';
import { isZeroRatedSupply } from 'floman-shared/gst';
import { PERMISSIONS } from 'floman-shared/permissions';
import { itemAmounts } from 'floman-shared/documentTotals';
import { qtyTextAllowed } from 'floman-shared/quantity';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { FormCard, OptionPills, SectionHeader } from '@/components/FormParts';
import { FullScreenModal } from '@/components/FullScreenModal';
import { PickerField } from '@/components/PickerField';
import { useSession } from '@/features/auth/session';
import { getPartMeta } from '@/features/parts/api';
import { PartForm } from '@/features/parts/components/PartForm';
import { formatMoney } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import { newLine, priced, withPart, withRate, withRateWithTax, withTaxRate, type FormLine } from '../form';
import { PartSheet } from './PartSheet';

/** Digits and one point only, as typed ("12.5"). */
const decimal = (text: string) => text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

const DISCOUNT_OPTIONS = [
  { value: DISCOUNT_TYPE.PERCENTAGE, label: '%' },
  { value: DISCOUNT_TYPE.AMOUNT, label: '₹' },
];

/**
 * The Quotation's Items, as the web's table turned into one card per line: the part (from the Part Master), quantity
 * and free quantity in the part's unit, the rate before and with GST (typing one works out the other), the discount in
 * % or ₹, the GST rate, and the line's amount. SEZ with LUT charges no GST, so each line shows 0%.
 */
export function ItemsSection({ lines, onChange, supplyType, problem }: { lines: FormLine[]; onChange: (lines: FormLine[]) => void; supplyType: string; problem: { key: string; message: string } | null }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const queryClient = useQueryClient();
  const { can } = useSession();
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  // A part made or edited from this line (the web's "New part" / "Edit part"); `id` set = an existing part.
  const [quick, setQuick] = useState<{ key: string; id?: string } | null>(null);
  const canCreatePart = can(PERMISSIONS.PARTS.CREATE);
  const canUpdatePart = can(PERMISSIONS.PARTS.UPDATE);

  const meta = useQuery({ queryKey: ['part-meta'], queryFn: getPartMeta });
  const rates = meta.data?.taxRates ?? [];
  const exempt = isZeroRatedSupply(supplyType);
  // A part with no GST rate of its own takes the company's default rate (the web: the flagged one, else the first, else 18).
  const fallbackRate = Number(rates.find((r) => r.isDefault)?.percentage ?? rates[0]?.percentage ?? SYSTEM_DEFAULTS.DEFAULT_TAX_RATE);
  const rateOptions = (current: number) => {
    const list = [...new Set([...rates.map((r) => Number(r.percentage)), current])].sort((a, b) => a - b);
    return list.map((r) => ({ value: String(r), label: `${r}%` }));
  };

  const update = (key: string, change: (line: FormLine) => FormLine) => onChange(lines.map((l) => (l.key === key ? change(l) : l)));
  const money = (value: number) => (hide.hidden ? hide.rupees(0) : formatMoney(value));

  return (
    <View>
      <SectionHeader>Items</SectionHeader>
      <View style={{ gap: spacing.md }}>
        {lines.map((line, index) => {
          const a = itemAmounts(priced(line, exempt));
          const failed = problem?.key === line.key ? problem.message : null;
          const showRate = exempt ? 0 : line.taxRate;
          return (
            <FormCard key={line.key}>
              <View style={styles.lineHead}>
                <Text style={styles.lineTitle}>Item {index + 1}</Text>
                <View style={styles.lineActions}>
                  {line.partName ? (
                    <Pressable onPress={() => update(line.key, () => ({ ...newLine(), key: line.key }))} accessibilityRole="button" hitSlop={8} style={styles.textButton}>
                      <Text style={[styles.textButtonText, { color: colors.brandText }]}>Clear</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => onChange(lines.filter((l) => l.key !== line.key))}
                    disabled={lines.length <= 1}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove item ${index + 1}`}
                    hitSlop={8}
                    style={[styles.iconButton, lines.length <= 1 && { opacity: 0.3 }]}
                  >
                    <Ionicons name="close" size={22} color={colors.muted} />
                  </Pressable>
                </View>
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text style={styles.label}>
                  Item<Text style={{ color: colors.danger }}> *</Text>
                </Text>
                <Pressable
                  onPress={() => setPickingKey(line.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Item ${index + 1}: ${line.partName || 'not chosen'}`}
                  style={({ pressed }) => [styles.box, failed ? { borderColor: colors.danger } : null, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[styles.boxText, !line.partName && { color: colors.placeholder }]} numberOfLines={2}>{line.partName || 'Search part…'}</Text>
                  <Ionicons name="chevron-down" size={18} color={colors.muted} />
                </Pressable>
                {failed ? <Text style={[styles.error, { color: colors.danger }]}>{failed}</Text> : null}
                {line.partId && canUpdatePart ? (
                  <Pressable onPress={() => setQuick({ key: line.key, id: line.partId ?? undefined })} accessibilityRole="button" style={styles.textButton}>
                    <Text style={[styles.textButtonText, { color: colors.brandText }]}>Edit part</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.pair}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Qty"
                    value={line.qty}
                    onChangeText={(v) => qtyTextAllowed(v) && update(line.key, (l) => ({ ...l, qty: v }))}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    suffix={line.uom || 'UOM'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Free qty"
                    value={line.freeQty}
                    onChangeText={(v) => qtyTextAllowed(v) && update(line.key, (l) => ({ ...l, freeQty: v }))}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    suffix={line.uom || 'UOM'}
                  />
                </View>
              </View>

              <View style={styles.pair}>
                <View style={{ flex: 1 }}>
                  <Field label="Rate" prefix="₹" value={line.rate} onChangeText={(v) => update(line.key, (l) => withRate(l, decimal(v)))} placeholder="0.00" keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Rate incl. GST" prefix="₹" value={line.rateWithTax} onChangeText={(v) => update(line.key, (l) => withRateWithTax(l, decimal(v)))} placeholder="0.00" keyboardType="decimal-pad" />
                </View>
              </View>

              <View style={styles.discountRow}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Discount"
                    value={line.discount}
                    onChangeText={(v) => {
                      const next = decimal(v);
                      // A percentage is never more than 100.
                      update(line.key, (l) => ({ ...l, discount: l.discountType === DISCOUNT_TYPE.PERCENTAGE && Number(next) > 100 ? '100' : next }));
                    }}
                    placeholder="0"
                    keyboardType="decimal-pad"
                  />
                </View>
                <OptionPills
                  label="Discount in % or ₹"
                  value={line.discountType as 'percentage' | 'amount'}
                  options={DISCOUNT_OPTIONS as { value: 'percentage' | 'amount'; label: string }[]}
                  onChange={(discountType) => update(line.key, (l) => ({ ...l, discountType, discount: discountType === DISCOUNT_TYPE.PERCENTAGE && Number(l.discount) > 100 ? '100' : l.discount }))}
                />
              </View>

              {exempt ? (
                <View style={{ gap: spacing.xs }}>
                  <Text style={styles.label}>GST</Text>
                  <Text style={styles.body}>GST exempt (0%)</Text>
                </View>
              ) : (
                <PickerField label="GST" value={String(line.taxRate)} options={rateOptions(line.taxRate)} onChange={(r) => update(line.key, (l) => withTaxRate(l, Number(r)))} />
              )}

              <Pressable onPress={() => update(line.key, (l) => ({ ...l, showSpecs: !l.showSpecs }))} accessibilityRole="button" accessibilityState={{ expanded: line.showSpecs }} style={styles.toggle}>
                <Ionicons name={line.showSpecs ? 'chevron-up' : 'add'} size={18} color={colors.ink} />
                <Text style={styles.toggleText}>{line.showSpecs ? 'Hide specs' : 'Add specs'}</Text>
                {line.scope && !line.showSpecs ? <View style={styles.dot} /> : null}
              </Pressable>
              {line.showSpecs ? (
                <Field label="Scope of work / specifications" value={line.scope} onChangeText={(scope) => update(line.key, (l) => ({ ...l, scope }))} placeholder="Scope of work, technical specifications…" multiline autoCapitalize="sentences" />
              ) : null}

              <View style={styles.amount}>
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Amount</Text>
                  <Text style={styles.amountTotal}>{money(a.totalWithTax)}</Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={styles.small}>Taxable</Text>
                  <Text style={styles.small}>{money(a.taxableAmount)}</Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={styles.small}>GST {showRate}%</Text>
                  <Text style={styles.small}>+{money(a.taxAmount)}</Text>
                </View>
                {a.discountAmount > 0 ? (
                  <View style={styles.amountRow}>
                    <Text style={styles.small}>Disc ({line.discountType === DISCOUNT_TYPE.AMOUNT ? '₹' : `${line.discount}%`})</Text>
                    <Text style={styles.small}>-{money(a.discountAmount)}</Text>
                  </View>
                ) : null}
              </View>
            </FormCard>
          );
        })}
        <Button title="Add item" tone="secondary" onPress={() => onChange([...lines, newLine()])} />
      </View>

      <PartSheet
        visible={pickingKey !== null}
        selectedId={lines.find((l) => l.key === pickingKey)?.partId}
        onPick={(part) => pickingKey && update(pickingKey, (l) => withPart(l, part, fallbackRate))}
        onNew={
          canCreatePart
            ? () => {
                // The full-screen form opens once the sheet has closed (a phone can't show two at once).
                const key = pickingKey;
                setTimeout(() => key && setQuick({ key }), 400);
              }
            : undefined
        }
        onClose={() => setPickingKey(null)}
      />

      <FullScreenModal visible={quick !== null} onClose={() => setQuick(null)}>
        {quick ? (
          <PartForm
            key={quick.id ?? 'new'}
            id={quick.id}
            back="Quotation"
            onCancel={() => setQuick(null)}
            onDone={(saved) => {
              // The line takes the part as saved (its name, unit, price and GST), as on the web.
              update(quick.key, (l) => withPart(l, saved, fallbackRate));
              void queryClient.invalidateQueries({ queryKey: ['quotation-parts'] });
              setQuick(null);
            }}
          />
        ) : null}
      </FullScreenModal>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
    lineTitle: { ...type.headline, color: c.ink },
    lineActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    textButton: { minHeight: 44, justifyContent: 'center' },
    textButtonText: { ...type.subhead, fontWeight: '600' },
    iconButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
    label: { ...type.subhead, fontWeight: '600', color: c.ink },
    body: { ...type.body, color: c.ink },
    box: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 48, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    boxText: { ...type.body, flex: 1, color: c.ink, fontWeight: '600' },
    error: { ...type.footnote },
    pair: { flexDirection: 'row', gap: spacing.md },
    discountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
    toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
    toggleText: { ...type.subhead, fontWeight: '600', color: c.ink },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.muted },
    amount: { backgroundColor: c.background, borderRadius: 12, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.xs },
    amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    amountLabel: { ...type.subhead, fontWeight: '600', color: c.muted },
    amountTotal: { ...type.headline, fontWeight: '700', color: c.ink },
    small: { ...type.footnote, color: c.muted },
  });
