import { AUDIT_ACTION_LABELS } from 'floman-shared/constants';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { formatDate } from '@/lib/format';
import { spacing, type, useThemed, type Colors } from '@/theme';
import type { HistoryEntry } from '../api';

/** "Submitted for approval" for a known action; the code in words for any other (the web's History tab). */
const actionText = (action: string) =>
  AUDIT_ACTION_LABELS[action as keyof typeof AUDIT_ACTION_LABELS] ?? action.charAt(0) + action.slice(1).replace(/_/g, ' ').toLowerCase();

const who = (by: HistoryEntry['changedBy']) => (by ? `${by.firstName ?? ''} ${by.lastName ?? ''}`.trim() || by.email || 'Someone' : 'The system');

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A document's History: who did what and when, newest first, as a line down the left. */
export function HistoryTimeline({ entries }: { entries: HistoryEntry[] }) {
  const styles = useThemed(makeStyles);
  if (entries.length === 0) return <Text style={styles.empty}>No history yet.</Text>;
  return (
    <View style={{ gap: spacing.lg }}>
      {entries.map((entry) => {
        const remark = text(entry.newValues?.approvalRemarks) ?? text(entry.newValues?.remarks) ?? text(entry.newValues?.reason);
        const summary = text(entry.newValues?.summary);
        const at = new Date(entry.createdAt);
        return (
          <View key={entry.id} style={styles.entry}>
            <View style={styles.dot} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.action}>{actionText(entry.action)}</Text>
              <Text style={styles.meta}>{who(entry.changedBy)} · {formatDate(at)}, {at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
              {summary ? <Text style={styles.summary}>{summary}</Text> : null}
              {remark ? <Text style={styles.remark}>“{remark}”</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    empty: { ...type.subhead, color: c.muted, textAlign: 'center', paddingVertical: spacing.lg },
    entry: { flexDirection: 'row', gap: spacing.md },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.outline, marginTop: 6 },
    action: { ...type.subhead, fontWeight: '700', color: c.ink },
    meta: { ...type.footnote, color: c.muted },
    summary: { ...type.footnote, color: c.ink, marginTop: 2 },
    remark: { ...type.footnote, color: c.ink, backgroundColor: c.track, borderRadius: 8, padding: spacing.sm, marginTop: spacing.xs },
  });
