import { PO_STATUS } from 'floman-shared/statuses';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { type, useColors } from '@/theme';
import { statusLabel } from '../text';

/** A Purchase Order's status as a dot and a word, coloured as the web's badge (draft grey, waiting amber, in order green, bad red). */
export function StatusPill({ status, edited }: { status: string; edited?: boolean }) {
  const colors = useColors();
  const tone: Record<string, string> = {
    [PO_STATUS.DRAFT]: colors.muted,
    [PO_STATUS.PENDING_APPROVAL]: colors.warnText,
    [PO_STATUS.RETURNED]: colors.danger,
    [PO_STATUS.APPROVED]: colors.receive,
    [PO_STATUS.PARTIALLY_RECEIVED]: colors.receive,
    [PO_STATUS.RECEIVED]: colors.receive,
    [PO_STATUS.CANCELLED]: colors.muted,
  };
  const color = tone[status] ?? colors.muted;
  // Edited after approval and waiting again: its own words, as on the web.
  const label = status === PO_STATUS.PENDING_APPROVAL && edited ? 'Edited, waiting for approval' : statusLabel(status);
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
