import { GRN_STATUS, PAYMENT_STATUS } from 'floman-shared/statuses';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { type, useColors } from '@/theme';
import type { Grn } from '../api';
import { shownStatus, statusLabel } from '../text';

/** A GRN's one status as a dot and a word, coloured as the web's badge (draft grey, waiting or unpaid amber, paid green, bad red). */
export function StatusPill({ grn }: { grn: Pick<Grn, 'status' | 'paymentStatus' | 'editedAt'> }) {
  const colors = useColors();
  const shown = shownStatus(grn);
  const tone: Record<string, string> = {
    [GRN_STATUS.DRAFT]: colors.muted,
    [GRN_STATUS.PENDING_APPROVAL]: colors.warnText,
    [GRN_STATUS.RETURNED]: colors.danger,
    [GRN_STATUS.CANCELLED]: colors.muted,
    [PAYMENT_STATUS.UNPAID]: colors.warnText,
    [PAYMENT_STATUS.PARTIALLY_PAID]: colors.warnText,
    [PAYMENT_STATUS.PAID]: colors.receive,
  };
  const color = tone[shown] ?? colors.muted;
  // Edited after approval and waiting again: its own words, as on the web.
  const label = grn.status === GRN_STATUS.PENDING_APPROVAL && grn.editedAt ? 'Edited, waiting for approval' : statusLabel(shown);
  return (
    <View style={styles.row} accessible accessibilityLabel={`Status: ${label}`}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[type.footnoteBold, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
