import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { PERMISSIONS } from 'floman-shared/permissions';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { useSession } from '@/features/auth/session';
import { useUserAccess } from '@/features/users/useUserAccess';
import { useColors } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const tabIcon = (name: IconName) => ({ color, size }: { color: unknown; size: number }) => (
  <Ionicons name={name} size={size + 2} color={String(color)} />
);

/** What the red + adds on each screen of the More, Sales and Purchase tabs: where it goes, who may, and what it is called. */
const ADDS = [
  { prefix: '/purchase/debit-notes', href: '/purchase/debit-notes/edit', permission: PERMISSIONS.DEBIT_NOTES.CREATE, label: 'New debit note' },
  { prefix: '/purchase/purchase-indents', href: '/purchase/purchase-indents/edit', permission: PERMISSIONS.PURCHASE_INDENTS.CREATE, label: 'New purchase indent' },
  { prefix: '/purchase/indents', href: '/purchase/indents/edit', permission: PERMISSIONS.INDENTS.CREATE, label: 'New indent' },
  { prefix: '/purchase/purchases', href: '/purchase/purchases/edit', permission: PERMISSIONS.PURCHASES.CREATE, label: 'New purchase' },
  { prefix: '/purchase/grns', href: '/purchase/grns/edit', permission: PERMISSIONS.GRNS.CREATE, label: 'New GRN' },
  { prefix: '/purchase/purchase-orders', href: '/purchase/purchase-orders/edit', permission: PERMISSIONS.PURCHASE_ORDERS.CREATE, label: 'New purchase order' },
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

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

/**
 * The bottom bar: Home fixed on the left, More fixed on the right, and between them ONE strip that scrolls sideways
 * (Sales, Purchase, Accounts) with the red + fixed over its middle. Two tabs show at a time, one each side of the +;
 * a swipe moves the strip by one tab: Sales slides off to the left, Purchase takes its place and Accounts takes
 * Purchase's. Each tab is followed by a gap as wide as the +, so the + always sits in a clear gap. A tab hidden for the
 * user (`hidden`, set by `href: null`, e.g. Accounts without Ledger access) is left out. Opening a tab that is
 * scrolled out of view brings it back.
 */
function BottomBar({ state, descriptors, emitter, navigateToTab, insets }: TabBarProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const slot = width / 5;
  const ends = slot * 0.85;
  const gap = slot * 0.9;
  const strip = width - ends * 2;
  const itemWidth = (strip - gap) / 2;
  const pitch = itemWidth + gap;
  const scroll = useRef<{ scrollTo: (to: { x: number; animated: boolean }) => void } | null>(null);

  const routes = state.routes.filter((r) => !(descriptors[r.key]?.options as { hidden?: boolean } | undefined)?.hidden);
  const at = (name: string) => routes.find((r) => r.name === name);
  const middle = routes.filter((r) => r.name !== 'index' && r.name !== 'create' && r.name !== 'more');
  const focusedKey = state.routes[state.index]?.key;

  // The strip moves one tab at a time: tab 0 and 1 are in view at the start, tab 2 after one move, and so on.
  const focusedAt = middle.findIndex((r) => r.key === focusedKey);
  useEffect(() => {
    if (focusedAt >= 0) scroll.current?.scrollTo({ x: Math.max(0, focusedAt - 1) * pitch, animated: true });
  }, [focusedAt, pitch]);

  const tab = (route: (typeof routes)[number], w: number, trailingGap = 0) => {
    const { options } = descriptors[route.key]!;
    const focused = focusedKey === route.key;
    const color = focused ? colors.brandText : colors.muted;
    const press = () => {
      const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigateToTab(route.key);
    };
    return (
      <Pressable key={route.key} onPress={press} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={options.title} style={[styles.tab, { width: w, marginRight: trailingGap }]}>
        {options.tabBarIcon?.({ focused, color, size: 24 })}
        <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>{options.title}</Text>
      </Pressable>
    );
  };
  const home = at('index');
  const more = at('more');
  const create = at('create');
  return (
    <View style={[styles.bar, { backgroundColor: colors.background, borderTopColor: colors.divider, height: 72 + insets.bottom, paddingBottom: insets.bottom }]}>
      {home ? tab(home, ends) : <View style={{ width: ends }} />}
      <View style={{ width: strip, height: 56 }}>
        <ScrollView ref={scroll as never} horizontal showsHorizontalScrollIndicator={false} snapToInterval={pitch} snapToAlignment="start" decelerationRate="fast" contentContainerStyle={styles.strip}>
          {middle.map((r, i) => tab(r, itemWidth, i < middle.length - 1 ? gap : 0))}
        </ScrollView>
        {/* The + stays where it is while the tabs slide behind it. */}
        <View style={[styles.fabSlot, { left: (strip - gap) / 2, width: gap }]} pointerEvents="box-none">
          {create ? <CreateButton onPress={() => navigateToTab(create.key)} /> : null}
        </View>
      </View>
      {more ? tab(more, ends) : <View style={{ width: ends }} />}
    </View>
  );
}

export default function TabsLayout() {
  const colors = useColors();
  const { can } = useSession();
  return (
    <Tabs
      tabBar={(props) => <BottomBar {...props} />}
      screenOptions={{
        header: () => <AppHeader />,
        tabBarActiveTintColor: colors.brandText,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="sales" options={{ title: 'Sales', tabBarIcon: tabIcon('document-text-outline') }} />
      <Tabs.Screen name="create" options={{ title: '' }} />
      <Tabs.Screen name="purchase" options={{ title: 'Purchase', tabBarIcon: tabIcon('cube-outline') }} />
      {/* Accounts opens straight at the Ledger; it is left out of the bar for someone without Ledger access. */}
      <Tabs.Screen name="ledger" options={{ title: 'Accounts', tabBarIcon: tabIcon('book-outline'), href: can(PERMISSIONS.LEDGER.READ) ? undefined : null }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('ellipsis-horizontal') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  tab: { alignItems: 'center', gap: 2, minHeight: 56 },
  tabLabel: { fontSize: 13, fontWeight: '600' },
  strip: { alignItems: 'flex-start' },
  fabSlot: { position: 'absolute', top: 0, height: 56, zIndex: 2 },
  slot: { flex: 1, alignItems: 'center' },
  fab: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: '#8A171A', alignItems: 'center', justifyContent: 'center',
    marginTop: -26, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
});
