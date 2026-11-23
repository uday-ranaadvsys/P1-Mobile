import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { money } from '@/features/quotations/text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import type { Indent } from '../api';
import { daysLate, estimatedValue, isPressing, lateText, liveLines, priorityLabel } from '../text';
import { StatusPill } from './StatusPill';

/**
 * One Indent as a row, like the web's table row: its number and status, the department and priority, the project, the
 * required-by date (late ones say so), and the estimated value on the right. Tap opens it; long-press its actions.
 */
export function IndentRow({ indent, onOpen, onActions }: { indent: Indent; onOpen: () => void; onActions?: () => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const late = daysLate(indent);
  const lines = liveLines(indent.items).length;
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onActions}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityHint={onActions ? 'Press and hold for actions' : undefined}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.body}>
        <Text style={styles.number} numberOfLines={1}>{indent.indentNumber}</Text>
        <Text style={styles.party} numberOfLines={1}>
          {[indent.department?.name, indent.projectName].filter(Boolean).join(' · ') || '—'}
        </Text>
        <Text style={styles.small} numberOfLines={1}>
          <Text style={isPressing(indent.priority) ? { color: colors.warnText, fontWeight: '600' } : undefined}>{priorityLabel(indent.priority)}</Text>
          {indent.requiredByDate ? ` · Required by ${formatDate(indent.requiredByDate)}` : ''}
          {late > 0 ? <Text style={{ color: colors.warnText }}> · {lateText(late)}</Text> : null}
        </Text>
        <StatusPill status={indent.status} />
      </View>
      <View style={styles.amount}>
        <Text style={styles.total}>{hide.hidden ? hide.rupees(0) : money(estimatedValue(indent))}</Text>
        <Text style={styles.small}>{lines} {lines === 1 ? 'item' : 'items'}</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, minHeight: 72 },
    body: { flex: 1, gap: 3 },
    number: { ...type.headline, color: c.ink },
    party: { ...type.subhead, color: c.ink },
    small: { ...type.footnote, color: c.muted },
    amount: { alignItems: 'flex-end', gap: 2 },
    total: { ...type.headline, color: c.ink },
  });
