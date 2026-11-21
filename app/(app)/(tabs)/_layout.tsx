import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { PERMISSIONS } from 'floman-shared/permissions';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { useSession } from '@/features/auth/session';
import { useUserAccess } from '@/features/users/useUserAccess';
import { useColors } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const tabIcon = (name: IconName) => ({ color, size }: { color: unknown; size: number }) => (
  <Ionicons name={name} size={size + 2} color={String(color)} />
);

/** What the red + adds on each screen of the More and Sales tabs: where it goes, who may, and what it is called. */
const ADDS = [
  { prefix: '/sales/quotations', href: '/sales/quotations/edit', permission: PERMISSIONS.QUOTATIONS.CREATE, label: 'New quotation' },
  { prefix: '/more/parties', href: '/more/parties/edit', permission: PERMISSIONS.VENDORS.CREATE, label: 'New vendor or customer' },
  { prefix: '/more/parts', href: '/more/parts/edit', permission: PERMISSIONS.PARTS.CREATE, label: 'New part' },
  { prefix: '/more/users', href: '/more/users/edit', permission: PERMISSIONS.USERS.CREATE, label: 'Invite user', inviteOnly: true },
  { prefix: '/more/roles', href: '/more/roles/edit', permission: PERMISSIONS.ROLES.CREATE, label: 'New role', adminOnly: true },
] as const;

/**
 * The red + in the middle of the bar, lifted above it. It adds what the screen you are on is about (a vendor or
 * customer, a part); anywhere else it opens the Create page (new documents come later).
 */
function CreateButton({ onPress }: { onPress?: (...args: never[]) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { can } = useSession();
  const adds = ADDS.find((a) => pathname.startsWith(a.prefix));
  const access = useUserAccess();
  const press = () => {
    if (adds) {
      // Inviting a user is for an Admin with a free seat (the Users screen's own rule).
      const allowed = 'inviteOnly' in adds ? access.canInvite : 'adminOnly' in adds ? access.isAdmin && !access.readOnly : can(adds.permission);
      if (allowed) router.push(adds.href);
      return;
    }
    (onPress as () => void)();
  };
  return (
    <View style={styles.slot}>
      <Pressable onPress={press} style={styles.fab} accessibilityRole="button" accessibilityLabel={adds?.label ?? 'Create'}>
        <Ionicons name="add" size={36} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        header: () => <AppHeader />,
        tabBarActiveTintColor: colors.brandText,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.divider, height: 72, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="sales" options={{ title: 'Sales', tabBarIcon: tabIcon('document-text-outline') }} />
      <Tabs.Screen name="create" options={{ title: '', tabBarButton: (props) => <CreateButton onPress={props.onPress as never} /> }} />
      <Tabs.Screen name="purchase" options={{ title: 'Purchase', tabBarIcon: tabIcon('cube-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('ellipsis-horizontal') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1, alignItems: 'center' },
  fab: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: '#8A171A', alignItems: 'center', justifyContent: 'center',
    marginTop: -26, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
});
