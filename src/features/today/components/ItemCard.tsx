import { TODAY_GROUP } from 'floman-shared/constants';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import type { TodayGroupKey, TodayItem } from '@/features/today/api';
import { COMING_SOON, notify } from '@/lib/notify';
import { useHide } from '@/lib/privacy';
import { spacing, type, useThemed, type Colors } from '@/theme';
import { actionOf, badgeOf, detailOf, headOf } from '../text';

/**
 * One item of a Today group, as the web shows it in a row, arranged for a phone: its number and amount on top,
 * the party under it, why it is on the list, how late it is, then its button. The card opens `onOpen` (when
 * the item has a screen on the phone); the button does the item's next step, or says "Coming soon".
 */
export function ItemCard({ group, item, onOpen }: { group: TodayGroupKey; item: TodayItem; onOpen?: () => void }) {
  const styles = useThemed(makeStyles);
  const hide = useHide();
  const { top, party } = headOf(group, item);
  const badge = badgeOf(group, item);
  const detail = detailOf(group, item);
  const action = actionOf(group);
  const press = () => (action.works && onOpen ? onOpen() : notify(COMING_SOON));
  return (
    <Pressable
      onPress={onOpen}
      disabled={!onOpen}
      accessibilityRole={onOpen ? 'button' : undefined}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.head}>
        <Text style={styles.number} numberOfLines={1}>{top}</Text>
        {item.amount != null ? <Text style={styles.amount}>{hide.rupees(item.amount)}</Text> : null}
      </View>
      {party ? <Text style={styles.party} numberOfLines={2}>{hide.text(party)}</Text> : null}
      {detail ? <Text style={styles.detail} numberOfLines={group === TODAY_GROUP.FIX ? undefined : 3}>{detail}</Text> : null}
      {badge ? <Text style={[styles.badge, badge.tone === 'late' ? styles.late : styles.waiting]}>{badge.text}</Text> : null}
      <Pressable onPress={press} accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && { opacity: 0.75 }]}>
        <Text style={styles.buttonText}>{action.label}</Text>
      </Pressable>
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.xs },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
    number: { ...type.footnote, flex: 1, color: c.muted },
    amount: { ...type.title3, color: c.ink },
    party: { ...type.headline, color: c.ink },
    detail: { ...type.subhead, color: c.muted },
    badge: { ...type.footnoteBold, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', marginTop: spacing.xs },
    late: { color: c.lateText, backgroundColor: c.lateBg },
    waiting: { color: c.waitText, backgroundColor: c.waitBg },
    // The web's .btn-secondary for an item's action: transparent, a grey outline, dark semibold text. 48 pt tall.
    button: { marginTop: spacing.sm, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: c.outline, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    buttonText: { ...type.headline, color: c.ink },
  });
