import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ADMIN_ROLE_NAME, PERMISSIONS } from 'floman-shared/permissions';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { SectionHeader, SwitchRow } from '@/components/FormParts';
import { useSession } from '@/features/auth/session';
import { usePrivacy } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

type Row = {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Where it opens; none yet means "Coming soon". */
  href?: string;
  /** Shown only to those with this permission. */
  permission?: string;
  /** Shown only to an Admin (the web's adminOnly). */
  adminOnly?: boolean;
};

/**
 * The web's menu groups that are not tabs: Masters and Settings, in the web's order, each row only for those who may
 * open it. A row whose screen is not built yet opens a "Coming soon" page, so the menu looks complete.
 */
const GROUPS: { name: string; rows: Row[] }[] = [
  {
    name: 'Masters',
    rows: [
      { title: 'Part Master', icon: 'cube-outline', permission: PERMISSIONS.PARTS.READ, href: '/more/parts' },
      { title: 'Vendors & Customers', icon: 'business-outline', permission: PERMISSIONS.VENDORS.READ, href: '/more/parties' },
    ],
  },
  {
    name: 'Settings',
    rows: [
      { title: 'My Company', icon: 'storefront-outline', permission: PERMISSIONS.COMPANY.READ, href: '/more/company' },
      { title: 'Users', icon: 'people-outline', permission: PERMISSIONS.USERS.READ, href: '/more/users' },
      { title: 'Roles & Permissions', icon: 'shield-checkmark-outline', permission: PERMISSIONS.ROLES.READ, href: '/more/roles' },
      { title: 'E-Way Bill', icon: 'car-outline', adminOnly: true, href: '/more/eway-bill' },
    ],
  },
];

export default function More() {
  const { user, signOut, can } = useSession();
  const { hidden, toggle } = usePrivacy();
  const router = useRouter();
  const colors = useColors();
  const styles = useThemed(makeStyles);
  const [busy, setBusy] = useState(false);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const isAdmin = Boolean(user?.roles.includes(ADMIN_ROLE_NAME));
  const visible = (r: Row) => (r.adminOnly ? isAdmin : r.permission ? can(r.permission) : true);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
      <View style={styles.card}>
        <Text style={styles.name}>{name || user?.email}</Text>
        {name ? <Text style={styles.sub}>{user?.email ?? user?.phoneNo}</Text> : null}
      </View>

      {GROUPS.map((group) => {
        const rows = group.rows.filter(visible);
        if (rows.length === 0) return null;
        return (
          <View key={group.name}>
            <SectionHeader>{group.name}</SectionHeader>
            <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
              {rows.map((row, i) => (
                <Pressable
                  key={row.title}
                  onPress={() => (row.href ? router.push(row.href as never) : router.push({ pathname: '/more/soon', params: { title: row.title } }))}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name={row.icon} size={22} color={colors.muted} />
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.faint} />
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}

      <View>
        <SectionHeader>Privacy</SectionHeader>
        <View style={styles.card}>
          <SwitchRow label="Privacy mode" help="Hide amounts and names on screen" value={hidden} onChange={toggle} />
        </View>
      </View>

      <Button
        title="Sign out"
        tone="secondary"
        busy={busy}
        onPress={() => {
          setBusy(true);
          void signOut();
        }}
      />
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.xs },
    name: { ...type.title3, color: c.ink },
    sub: { ...type.subhead, color: c.muted },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.md },
    rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    rowTitle: { ...type.body, flex: 1, color: c.ink },
  });
