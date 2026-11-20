import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TodayGroupKey, TodayItem } from '@/features/today/api';
import { useHide } from '@/lib/privacy';
import { radius, spacing, useThemed, type Colors } from '@/theme';
import { badgeOf, detailOf, headOf } from '../text';

/**
 * One item of a Today group, as a card: its number and amount, its party, why it is there, a
 * late/waiting badge, and (when it has one that works on the phone) a button. The card opens `onPress`.
 */
export function ItemCard({ group, item, onPress, actionLabel }: {
  group: TodayGroupKey; item: TodayItem; onPress?: () => void; actionLabel?: string;
}) {
  const styles = useThemed(makeStyles);
  const hide = useHide();
  const { top, party } = headOf(group, item);
  const badge = badgeOf(group, item);
  const detail = detailOf(group, item);
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={styles.top}>
        <Text style={styles.number} numberOfLines={1}>{top}</Text>
        {item.amount != null ? <Text style={styles.amount}>{hide.rupees(item.amount)}</Text> : null}
      </View>
      {party ? <Text style={styles.party} numberOfLines={1}>{hide.text(party)}</Text> : null}
      {detail ? <Text style={styles.detail} numberOfLines={3}>{detail}</Text> : null}
      {badge ? <Text style={[styles.badge, badge.tone === 'late' ? styles.late : styles.waiting]}>{badge.text}</Text> : null}
      {actionLabel && onPress ? (
        <View style={styles.button}><Text style={styles.buttonText}>{actionLabel}</Text></View>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: 6 },
    top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
    number: { flex: 1, fontSize: 14, color: c.muted },
    amount: { fontSize: 20, fontWeight: '700', color: c.ink },
    party: { fontSize: 17, fontWeight: '700', color: c.ink },
    detail: { fontSize: 14, color: c.muted },
    badge: { alignSelf: 'flex-start', fontSize: 13, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', marginTop: 2 },
    late: { color: c.lateText, backgroundColor: c.lateBg },
    waiting: { color: c.waitText, backgroundColor: c.waitBg },
    button: { marginTop: spacing.sm, borderRadius: radius + 2, paddingVertical: 14, alignItems: 'center', backgroundColor: c.brand },
    buttonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  });
