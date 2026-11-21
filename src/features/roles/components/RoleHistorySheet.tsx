import { useQuery } from '@tanstack/react-query';
import { AUDIT_ACTION_LABELS } from 'floman-shared/constants';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SheetModal } from '@/components/SheetModal';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ErrorText } from '@/components/Text';
import { formatDate } from '@/lib/format';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import { getRoleHistory, type RoleHistoryEntry } from '../api';

const actionText = (action: string) =>
  AUDIT_ACTION_LABELS[action as keyof typeof AUDIT_ACTION_LABELS] ?? action.charAt(0) + action.slice(1).replace(/_/g, ' ').toLowerCase();

const who = (by: RoleHistoryEntry['changedBy']) => (by ? `${by.firstName ?? ''} ${by.lastName ?? ''}`.trim() || by.email || 'Someone' : 'The system');

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** A role's History: who created it and who changed its permissions, newest first, as the web's History tab. */
export function RoleHistorySheet({ role, onClose }: { role: { id: string; name: string } | null; onClose: () => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const { data, isLoading, error } = useQuery({ queryKey: ['roles', 'history', role?.id], queryFn: () => getRoleHistory(role!.id), enabled: role !== null });

  return (
    <SheetModal visible={role !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>History</Text>
          <Text style={styles.sub}>{role?.name}</Text>
          {isLoading ? <ActivityIndicator color={colors.brandText} style={{ padding: spacing.lg }} /> : null}
          {error ? <ErrorText message="Could not load the history." /> : null}
          {data && data.length === 0 ? <Text style={styles.empty}>No history yet.</Text> : null}
          <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingVertical: spacing.sm }}>
            {(data ?? []).map((entry) => (
              <View key={entry.id} style={styles.entry}>
                <View style={styles.dot} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.action}>{actionText(entry.action)}</Text>
                  <Text style={styles.meta}>{who(entry.changedBy)} · {formatDate(entry.createdAt)}, {time(entry.createdAt)}</Text>
                  {entry.newValues?.summary ? <Text style={styles.summary}>{entry.newValues.summary}</Text> : null}
                </View>
              </View>
            ))}
          </ScrollView>
          <Button title="Close" tone="secondary" onPress={onClose} />
        </View>
      </View>
    </SheetModal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: c.surface, maxHeight: '85%', padding: spacing.lg, gap: spacing.sm, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    title: { ...type.title3, color: c.ink },
    sub: { ...type.subhead, color: c.muted },
    empty: { ...type.subhead, color: c.muted, textAlign: 'center', paddingVertical: spacing.lg },
    entry: { flexDirection: 'row', gap: spacing.md },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.outline, marginTop: 6 },
    action: { ...type.subhead, fontWeight: '700', color: c.ink },
    meta: { ...type.footnote, color: c.muted },
    summary: { ...type.footnote, color: c.ink, marginTop: 2 },
  });
