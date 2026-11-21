import { DEDUCTION_KIND, DEDUCTION_KIND_LABEL, DEDUCTION_TEXT } from 'floman-shared/constants';
import { StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Field } from '@/components/Field';
import { SectionHeader } from '@/components/FormParts';
import { formatMoney } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** What the Summary reads from the shared calculation (documentTotalsWithDeductions). */
type Totals = {
  subtotal: number;
  taxAmount: number;
  roundOffAmount: number;
  totalDiscount: number;
  grandTotal: number;
  deductions: { TCS: { rate: number; amount: number } | null; GST_TDS?: { rate: number; amount: number } | null; TDS?: { rate: number; amount: number } | null };
  /** The grand total less the GST-TDS and TDS kept back. */
  netDue?: number;
};

/**
 * The web's Summary: taxable amount, GST, the extra discount (a % typed here), TCS when ticked, the round-off switch,
 * the total discount and the grand total. The figures come from floman-shared, the server's own calculation.
 */
export function SummaryCard({ totals, exempt, extraDiscount, onExtraDiscount, isRoundOff, onRoundOff, purchase }: {
  totals: Totals; exempt: boolean; extraDiscount: string; onExtraDiscount: (v: string) => void; isRoundOff: boolean; onRoundOff: (v: boolean) => void;
  /** A purchase document: the TDS kept back and "Amount to pay" show after the grand total. */
  purchase?: boolean;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const money = (v: number) => (hide.hidden ? hide.rupees(0) : formatMoney(v));
  const tcs = totals.deductions.TCS;
  // The TDS kinds are kept back from what is paid, not added to the total (web: KeptBackSummaryRows).
  const keptBack = [DEDUCTION_KIND.GST_TDS, DEDUCTION_KIND.TDS].flatMap((kind) => {
    const worked = totals.deductions[kind];
    return worked && worked.amount > 0 ? [[kind, worked] as const] : [];
  });

  const row = (label: string, value: string, bold?: boolean) => (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.value, bold && { fontWeight: '700' }]}>{value}</Text>
    </View>
  );

  return (
    <View>
      <SectionHeader>Summary</SectionHeader>
      <View style={styles.card}>
        {row('Taxable amount', money(totals.subtotal))}
        {row(exempt ? 'GST (SEZ supply under LUT)' : 'GST', money(totals.taxAmount))}
        <Field
          label="Extra discount"
          value={extraDiscount}
          onChangeText={(v) => {
            const next = v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
            onExtraDiscount(Number(next) > 100 ? '100' : next);
          }}
          placeholder="0"
          keyboardType="decimal-pad"
          suffix="%"
        />
        {tcs && tcs.amount > 0 ? row(DEDUCTION_TEXT.addedLine(DEDUCTION_KIND_LABEL.TCS, tcs.rate), money(tcs.amount)) : null}
        <View style={styles.row}>
          <Text style={styles.muted}>Round off{`  ${hide.hidden ? '' : totals.roundOffAmount.toFixed(2)}`}</Text>
          <Switch value={isRoundOff} onValueChange={onRoundOff} trackColor={{ true: colors.brand }} accessibilityLabel="Round off" />
        </View>
        {totals.totalDiscount > 0 ? row('Total discount', `-${money(totals.totalDiscount)}`) : null}
        <View style={styles.total}>
          <Text style={styles.totalLabel}>Grand total</Text>
          <Text style={styles.totalValue}>{money(totals.grandTotal)}</Text>
        </View>
        {keptBack.length > 0 ? (
          <>
            {keptBack.map(([kind, worked]) => row(DEDUCTION_TEXT.lessLine(DEDUCTION_KIND_LABEL[kind], worked.rate), `-${money(worked.amount)}`))}
            <View style={styles.row}>
              <Text style={[styles.muted, { fontWeight: '700' }]}>{purchase ? DEDUCTION_TEXT.AMOUNT_TO_PAY : DEDUCTION_TEXT.AMOUNT_TO_RECEIVE}</Text>
              <Text style={styles.netValue}>{money(totals.netDue ?? totals.grandTotal)}</Text>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.md },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
    muted: { ...type.subhead, color: c.muted },
    value: { ...type.subhead, color: c.ink },
    total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: 1, borderTopColor: c.outline, paddingTop: spacing.md },
    totalLabel: { ...type.headline, color: c.ink },
    totalValue: { ...type.title1, color: c.ink },
    netValue: { ...type.headline, fontWeight: '700', color: c.ink },
  });
