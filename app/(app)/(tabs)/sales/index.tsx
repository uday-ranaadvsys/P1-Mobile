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
  permission: string;
};

/** The web's Sales menu, in its order, each row only for those who may open it. A screen not built yet opens "Coming soon". */
const ROWS: Row[] = [
  { title: 'Quotations', icon: 'document-text-outline', permission: PERMISSIONS.QUOTATIONS.READ, href: '/sales/quotations' },
  { title: 'Sales Orders', icon: 'cart-outline', permission: PERMISSIONS.SALES_ORDERS.READ },
  { title: 'Proforma Invoices', icon: 'reader-outline', permission: PERMISSIONS.PROFORMA_INVOICES.READ },
  { title: 'Delivery Challans', icon: 'car-outline', permission: PERMISSIONS.DELIVERY_CHALLANS.READ },
  { title: 'Invoices', icon: 'receipt-outline', permission: PERMISSIONS.INVOICES.READ },
  { title: 'Credit Notes', icon: 'return-down-back-outline', permission: PERMISSIONS.CREDIT_NOTES.READ },
];

export default function Sales() {
  const { can } = useSession();
  const router = useRouter();
  const colors = useColors();
  const styles = useThemed(makeStyles);
  const rows = ROWS.filter((r) => can(r.permission));
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
      <Text style={styles.title} accessibilityRole="header">Sales</Text>
      <View style={styles.card}>
        {rows.map((row, i) => (
          <Pressable
            key={row.title}
            onPress={() => (row.href ? router.push(row.href as never) : router.push({ pathname: '/sales/soon', params: { title: row.title } }))}
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
