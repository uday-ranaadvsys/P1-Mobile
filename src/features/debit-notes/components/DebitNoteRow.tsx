import { NOTE_STATUS } from 'floman-shared/statuses';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { money } from '@/features/quotations/text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import type { DebitNote } from '../api';
import { sourceText, statusLabel } from '../text';

/** A Debit Note's status as a dot and a word (draft grey, waiting amber, approved green, returned red). Edited after approval and waiting again: its own words. */
export function StatusPill({ status, edited }: { status: string; edited?: boolean }) {
  const colors = useColors();
  const tone: Record<string, string> = {
    [NOTE_STATUS.DRAFT]: colors.muted,
    [NOTE_STATUS.PENDING_APPROVAL]: colors.warnText,
    [NOTE_STATUS.RETURNED]: colors.danger,
    [NOTE_STATUS.APPROVED]: colors.receive,
    [NOTE_STATUS.CANCELLED]: colors.muted,
  };
  const color = tone[status] ?? colors.muted;
  const label = status === NOTE_STATUS.PENDING_APPROVAL && edited ? 'Edited, waiting for approval' : statusLabel(status);
  return (
    <View style={pill.row} accessible accessibilityLabel={`Status: ${label}`}>
      <View style={[pill.dot, { backgroundColor: color }]} />
      <Text style={[type.footnoteBold, { color }]}>{label}</Text>
    </View>
  );
}

const pill = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

/**
 * One Debit Note as a row: its number and status, the vendor, the GRN it is against, its date and reason, and the grand
 * total on the right (with what is left of it, once approved). Tap opens it; long-press opens its actions.
 */
export function DebitNoteRow({ note, onOpen, onActions }: { note: DebitNote; onOpen: () => void; onActions?: () => void }) {
  const styles = useThemed(makeStyles);
  const hide = useHide();
  const left = Number(note.unappliedAmount) || 0;
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
        <Text style={styles.number} numberOfLines={1}>{note.noteNumber}</Text>
        <Text style={styles.party} numberOfLines={1}>{note.vendor ? hide.text([note.vendor.name, note.vendor.city].filter(Boolean).join(' · ')) : '—'}</Text>
        <Text style={styles.small} numberOfLines={1}>{[formatDate(note.noteDate), sourceText(note)].filter(Boolean).join(' · ')}</Text>
        {note.reason ? <Text style={styles.small} numberOfLines={1}>{note.reason}</Text> : null}
        <StatusPill status={note.status} edited={Boolean(note.editedAt)} />
      </View>
      <View style={styles.amount}>
        <Text style={styles.total}>{hide.hidden ? hide.rupees(0) : money(note.grandTotal)}</Text>
        {note.status === NOTE_STATUS.APPROVED && left > 0 ? <Text style={styles.small}>{hide.hidden ? hide.rupees(0) : money(left)} left</Text> : <Text style={styles.small}>{Number(note.taxAmount) === 0 ? 'No GST' : 'incl. GST'}</Text>}
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
