import { Ionicons } from '@expo/vector-icons';
import { DEDUCTION_KIND, DEDUCTION_KIND_LABEL, DEDUCTION_KIND_ORDER, DEDUCTION_TEXT, type DeductionKind } from 'floman-shared/constants';
import { sectionLabel, thresholdMessage, type DeductionAmount, type DocumentValues } from 'floman-shared/taxDeduction';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Field } from '@/components/Field';
import { PickerField } from '@/components/PickerField';
import { SwitchRow } from '@/components/FormParts';
import { formatINR } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import type { DocumentDeductions } from './useDocumentDeductions';

/**
 * The TDS / TCS card of a document form (the web's TaxDeductionCard): a switch for each box the document has
 * (a Quotation: TCS only); a ticked box opens its section list, the rate the section sets, and the amount.
 * TDS and TCS untick each other. A limit shows its message under the row.
 */
/** The folded card's one line: what is ticked, at what rate and for how much ("TDS 2% · ₹960.00"), or "None". */
export function useDeductionSummary(deductions: DocumentDeductions, amounts: Record<DeductionKind, DeductionAmount | null>) {
  const hide = useHide();
  const parts = DEDUCTION_KIND_ORDER.filter((kind) => deductions.kinds.includes(kind) && deductions.ticked[kind]).map((kind) => {
    const section = deductions.sectionIds[kind] ? deductions.byId.get(deductions.sectionIds[kind]!) : undefined;
    const worked = amounts[kind];
    return [DEDUCTION_KIND_LABEL[kind], section ? `${section.rate}%` : null, worked ? (hide.hidden ? hide.rupees(0) : formatINR(worked.amount)) : null].filter(Boolean).join(' ');
  });
  return parts.length ? parts.join(' · ') : 'None';
}

export function DeductionCard({ deductions, values, amounts, embedded }: {
  deductions: DocumentDeductions; values: DocumentValues; amounts: Record<DeductionKind, DeductionAmount | null>;
  /** Inside a folding section that already has the title and the card: only a small "how it works" row on top. */
  embedded?: boolean;
}) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const { kinds, side, typedTcs, tcsTyped, setTcsTyped, ticked, sectionIds, byId, sectionsFor, toggle, pick, history } = deductions;
  const order = DEDUCTION_KIND_ORDER.filter((kind) => kinds.includes(kind));
  const blockedBy = (kind: DeductionKind) => {
    const other = kind === DEDUCTION_KIND.TDS ? DEDUCTION_KIND.TCS : kind === DEDUCTION_KIND.TCS ? DEDUCTION_KIND.TDS : null;
    return Boolean(other && kinds.includes(other) && ticked[other]);
  };

  return (
    <View style={embedded ? { gap: spacing.md } : styles.card}>
      <View style={styles.head}>
        <Text style={embedded ? styles.muted : styles.title}>{embedded ? 'How it works' : DEDUCTION_TEXT.CARD_TITLE}</Text>
        <Pressable
          onPress={() => Alert.alert(DEDUCTION_TEXT.CARD_TITLE, kinds.length === 1 ? DEDUCTION_TEXT.TCS_ONLY_HINT : DEDUCTION_TEXT.CARD_HINT)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`About ${DEDUCTION_TEXT.CARD_TITLE}`}
          style={styles.info}
        >
          <Ionicons name="information-circle-outline" size={20} color={colors.muted} />
        </Pressable>
      </View>

      {order.map((kind) => {
        const blocked = blockedBy(kind);
        const section = sectionIds[kind] ? byId.get(sectionIds[kind]!) ?? null : null;
        const worked = amounts[kind];
        const notice = ticked[kind] && section ? thresholdMessage(section, values, history, side) : null;
        // A GRN's TCS: typed to match the vendor's bill (their rounding); the rate stays the section's.
        const typeable = kind === DEDUCTION_KIND.TCS && typedTcs && Boolean(section);
        return (
          <View key={kind} style={{ gap: spacing.sm }}>
            <SwitchRow
              label={DEDUCTION_KIND_LABEL[kind]}
              help={blocked ? (kind === DEDUCTION_KIND.TDS ? DEDUCTION_TEXT.NOT_WITH_TCS : DEDUCTION_TEXT.NOT_WITH_TDS) : undefined}
              value={ticked[kind]}
              onChange={(on) => toggle(kind, on)}
              disabled={blocked}
            />
            {ticked[kind] ? (
              <View style={styles.open}>
                <PickerField
                  label={DEDUCTION_TEXT.applyLabel(DEDUCTION_KIND_LABEL[kind])}
                  value={section?.id ?? ''}
                  placeholder={DEDUCTION_TEXT.PICK_SECTION}
                  options={sectionsFor(kind).map((s) => ({ value: s.id, label: sectionLabel(s) }))}
                  onChange={(id) => pick(kind, id)}
                  searchable
                />
                {typeable ? (
                  <Field
                    label={DEDUCTION_TEXT.TCS_AS_ON_BILL}
                    prefix="₹"
                    suffix={section ? `${section.rate}%` : undefined}
                    value={tcsTyped !== null ? String(tcsTyped) : worked ? String(worked.amount) : ''}
                    onChangeText={(v) => setTcsTyped(v === '' ? null : Math.max(0, Math.round(Number(v.replace(/[^0-9]/g, '')) || 0)))}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                ) : (
                  <View style={styles.amountRow}>
                    <Text style={styles.muted}>{section ? `${section.rate}%` : ''}</Text>
                    <Text style={styles.amount}>{worked ? (hide.hidden ? hide.rupees(0) : formatINR(worked.amount)) : '—'}</Text>
                  </View>
                )}
                {notice ? (
                  <View style={styles.notice}>
                    <Ionicons name="information-circle" size={16} color={colors.warnText} />
                    <Text style={[styles.noticeText, { color: colors.warnText }]}>{notice}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.md },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    title: { ...type.headline, color: c.ink },
    info: { minHeight: 32, minWidth: 32, alignItems: 'center', justifyContent: 'center' },
    open: { backgroundColor: c.background, borderRadius: 12, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.sm },
    amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    muted: { ...type.subhead, color: c.muted },
    amount: { ...type.headline, fontWeight: '700', color: c.ink },
    notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
    noticeText: { ...type.footnote, flex: 1 },
  });
