import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PERMISSIONS } from 'floman-shared/permissions';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useSession } from '@/features/auth/session';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

type Row = {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Where it opens; none yet means "Coming soon". */
  href?: string;
  /** Opens for someone with any one of these (the web's rule for Manage Indents). */
  permission: string | string[];
};

/** The web's Purchase menu, in its order, each row only for those who may open it. A screen not built yet opens "Coming soon". */
const ROWS: Row[] = [
  { title: 'Indents', icon: 'clipboard-outline', permission: PERMISSIONS.INDENTS.READ },
  { title: 'Manage Indents', icon: 'list-outline', permission: [PERMISSIONS.INDENTS.READ, PERMISSIONS.PURCHASE_INDENTS.CREATE, PERMISSIONS.PURCHASE_ORDERS.CREATE] },
  { title: 'Purchase Indents', icon: 'checkmark-done-outline', permission: PERMISSIONS.PURCHASE_INDENTS.READ },
  { title: 'Purchase Orders', icon: 'receipt-outline', permission: PERMISSIONS.PURCHASE_ORDERS.READ, href: '/purchase/purchase-orders' },
  { title: 'Purchases', icon: 'bag-outline', permission: PERMISSIONS.PURCHASES.READ },
  { title: 'GRN', icon: 'cube-outline', permission: PERMISSIONS.GRNS.READ },
  { title: 'Debit Notes', icon: 'return-up-forward-outline', permission: PERMISSIONS.DEBIT_NOTES.READ },
];

export default function Purchase() {
  const { can } = useSession();
  const router = useRouter();
  const colors = useColors();
  const styles = useThemed(makeStyles);
  const rows = ROWS.filter((r) => (Array.isArray(r.permission) ? r.permission.some(can) : can(r.permission)));
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
      <Text style={styles.title} accessibilityRole="header">Purchase</Text>
      <View style={styles.card}>
        {rows.map((row, i) => (
          <Pressable
            key={row.title}
            onPress={() => (row.href ? router.push(row.href as never) : router.push({ pathname: '/purchase/soon', params: { title: row.title } }))}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name={row.icon} size={22} color={colors.muted} />
            <Text style={styles.rowTitle}>{row.title}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.faint} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    title: { ...type.title1, color: c.ink },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.md },
    rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    rowTitle: { ...type.body, flex: 1, color: c.ink },
  });
