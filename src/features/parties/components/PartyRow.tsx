import { Ionicons } from '@expo/vector-icons';
import { PARTY_TYPE, PAYMENT_TYPE, PAYMENT_TYPE_LABEL } from 'floman-shared/constants';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/AppText';
import { formatINR } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import type { Party } from '../api';
import { balanceColor, contactLine, gstinText, PARTY_TYPE_LABEL } from '../text';

/**
 * One party as a row: an avatar, the name, its type and GSTIN, a warning when there is no contact, and what is
 * owed on the right ("RECEIVE ₹1,595" in green, "PAY ₹400" in red, a dash when nothing). Tap opens it; long-press
 * opens its actions.
 */
export function PartyRow({ party, onOpen, onActions }: { party: Party; onOpen: () => void; onActions?: () => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const owed = party.balance ?? 0;
  const noContact = !party.contactPerson && !party.phone;
  const dot = party.type === PARTY_TYPE.CUSTOMER ? colors.waitText : colors.faint;
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onActions}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityHint={onActions ? 'Press and hold for actions' : undefined}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <Avatar name={party.name} hidden={hide.hidden} />
      <View style={styles.body}>
        <Text style={[styles.name, !party.isActive && { color: colors.faint }]} numberOfLines={2}>{hide.text(party.name)}</Text>
        <View style={styles.pills}>
          <View style={styles.pill}>
            <View style={[styles.dot, { backgroundColor: dot }]} />
            <Text style={styles.pillText}>{PARTY_TYPE_LABEL[party.type] ?? party.type}</Text>
          </View>
          <Text style={styles.gstin} numberOfLines={1}>{gstinText(party)}</Text>
          {!party.isActive ? <Text style={styles.inactive}>Inactive</Text> : null}
        </View>
        {noContact ? (
          <View style={styles.warn}>
            <Ionicons name="warning" size={14} color={colors.warnText} />
            <Text style={[styles.warnText, { color: colors.warnText }]}>No contact added</Text>
          </View>
        ) : (
          <Text style={styles.contact} numberOfLines={1}>{hide.text(contactLine(party))}</Text>
        )}
      </View>
      <View style={styles.owed}>
        {owed ? (
          <>
            <Text style={styles.caption}>{owed > 0 ? PAYMENT_TYPE_LABEL[PAYMENT_TYPE.RECEIPT] : PAYMENT_TYPE_LABEL[PAYMENT_TYPE.PAYMENT]}</Text>
            <Text style={[styles.amount, { color: balanceColor(owed, colors) }]}>{hide.hidden ? hide.rupees(0) : formatINR(Math.abs(owed))}</Text>
          </>
        ) : (
          <Text style={[styles.amount, { color: colors.faint }]}>—</Text>
        )}
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, minHeight: 72 },
    body: { flex: 1, gap: 4 },
    name: { ...type.headline, color: c.ink },
    pills: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.track, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    pillText: { ...type.footnoteBold, color: c.ink },
    gstin: { ...type.footnote, color: c.muted, flexShrink: 1 },
    inactive: { ...type.footnoteBold, color: c.muted },
    warn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    warnText: { ...type.subhead },
    contact: { ...type.subhead, color: c.muted },
    owed: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 72, paddingTop: 2 },
    caption: { ...type.footnoteBold, color: c.muted, letterSpacing: 0.4, textTransform: 'uppercase' },
    amount: { ...type.headline, fontWeight: '700' },
  });
