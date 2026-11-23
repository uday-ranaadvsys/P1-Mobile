import { INDENT_STATUS } from 'floman-shared/statuses';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { type, useColors } from '@/theme';
import { statusLabel } from '../text';

/** An Indent's status as a dot and a word, coloured as the web's badge (draft grey, waiting amber, ordered / received green, returned red). */
export function StatusPill({ status }: { status: string }) {
  const colors = useColors();
  const tone: Record<string, string> = {
    [INDENT_STATUS.DRAFT]: colors.muted,
    [INDENT_STATUS.SUBMITTED]: colors.warnText,
    [INDENT_STATUS.RETURNED]: colors.danger,
    [INDENT_STATUS.PARTIALLY_ORDERED]: colors.warnText,
    [INDENT_STATUS.ORDERED]: colors.receive,
    [INDENT_STATUS.PARTIALLY_RECEIVED]: colors.receive,
    [INDENT_STATUS.RECEIVED]: colors.receive,
    [INDENT_STATUS.CANCELLED]: colors.muted,
  };
  const color = tone[status] ?? colors.muted;
  return (
    <View style={styles.row} accessible accessibilityLabel={`Status: ${statusLabel(status)}`}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[type.footnoteBold, { color }]}>{statusLabel(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
