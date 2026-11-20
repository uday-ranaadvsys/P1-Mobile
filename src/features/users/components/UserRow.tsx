import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import type { AppUser } from '../api';
import { contactText, displayName, roleText, signInText } from '../text';

/**
 * One user as a row, like the web's table row: an avatar, the name (and "You"), email or mobile, role and
 * department, last sign-in, and whether they are active. Tap opens them; long-press opens their actions.
 */
export function UserRow({ user, isMe, onOpen, onActions }: { user: AppUser; isMe: boolean; onOpen: () => void; onActions?: () => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onActions}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityHint={onActions ? 'Press and hold for actions' : undefined}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <Avatar name={displayName(user)} />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, !user.isActive && { color: colors.faint }]} numberOfLines={1}>{displayName(user)}</Text>
          {isMe ? <Text style={styles.you}>You</Text> : null}
        </View>
        <Text style={styles.sub} numberOfLines={1}>{contactText(user)}</Text>
        <Text style={styles.small} numberOfLines={1}>{[roleText(user), user.department?.name].filter((v) => v && v !== '—').join(' · ') || 'No role'}</Text>
        <Text style={styles.small} numberOfLines={1}>Last sign-in: {signInText(user.lastSignInAt)}</Text>
      </View>
      <Text style={[styles.status, user.isActive ? styles.active : styles.inactive]}>{user.isActive ? 'Active' : 'Inactive'}</Text>
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, minHeight: 72 },
    body: { flex: 1, gap: 3 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    name: { ...type.headline, flexShrink: 1, color: c.ink },
    you: { ...type.footnoteBold, color: c.muted, borderWidth: 1, borderColor: c.outline, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
    sub: { ...type.subhead, color: c.muted },
    small: { ...type.footnote, color: c.muted },
    status: { ...type.footnoteBold, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
    active: { color: c.receive, backgroundColor: 'rgba(16,185,129,0.14)' },
    inactive: { color: c.muted, backgroundColor: c.track },
  });
