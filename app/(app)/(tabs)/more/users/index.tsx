import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { LIST_FILTER } from 'floman-shared/constants';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/FormParts';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { listDepartments, listRoles, listUsers, type AppUser } from '@/features/users/api';
import { ResetPasswordSheet } from '@/features/users/components/ResetPasswordSheet';
import { activeFilterCount, DEFAULT_USER_FILTERS, STATUS_CHIPS, STATUS_LABEL, UserFilterSheet, type UserFilterState } from '@/features/users/components/UserFilterSheet';
import { UserRow } from '@/features/users/components/UserRow';
import { displayName, fullName } from '@/features/users/text';
import { useToggleUser, useUserAccess } from '@/features/users/useUserAccess';
import { notify } from '@/lib/notify';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/**
 * Users, as the web shows them: who can sign in and what they can do. The plan's seats, search, a Role / Department /
 * Status filter sheet, then every user as a row with role, department and last sign-in. Tap opens one, long-press its
 * actions, the red + in the tab bar invites a user (Admin only).
 */
export default function Users() {
  const router = useRouter();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const access = useUserAccess();
  const toggle = useToggleUser((m) => setError(m));

  const users = useQuery({ queryKey: ['users'], queryFn: listUsers });
  // Roles need Roles: Read, so a user without it just has no Role filter (the web asks the same way).
  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles, retry: false });
  const departments = useQuery({ queryKey: ['departments'], queryFn: listDepartments, retry: false });

  const [typed, setTyped] = useState('');
  const [filters, setFilters] = useState<UserFilterState>(DEFAULT_USER_FILTERS);
  const [sheet, setSheet] = useState(false);
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const [reset, setReset] = useState<AppUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return (users.data ?? []).filter((u) => {
      const matchesSearch = !q || fullName(u).toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q) || (u.phoneNo ?? '').includes(q);
      const matchesRole = filters.role === LIST_FILTER.ALL || u.roles?.some((r) => r.id === filters.role);
      const matchesDept = filters.department === LIST_FILTER.ALL || (u.departmentId ?? u.department?.id) === filters.department;
      const matchesStatus = filters.status === 'all' || (filters.status === 'active' && u.isActive) || (filters.status === 'inactive' && !u.isActive);
      return matchesSearch && matchesRole && matchesDept && matchesStatus;
    });
  }, [users.data, typed, filters]);
  const filterCount = activeFilterCount(filters);

  // Long-press: the actions the web has in a row's menu (nothing for a read-only session, or an Admin's account to a non-Admin).
  const actions = (u: AppUser) => {
    if (!access.canManage(u)) return;
    setMenu({
      title: displayName(u),
      actions: [
        { label: 'Edit', onPress: () => router.push({ pathname: '/more/users/edit', params: { id: u.id } }) },
        { label: 'Reset password', onPress: () => setReset(u) },
        // Not on your own account.
        ...(u.id !== access.meId ? [{ label: u.isActive ? 'Deactivate' : 'Activate', destructive: u.isActive, onPress: () => toggle.toggle(u) }] : []),
      ],
    });
  };

  const seatShare = access.seatLimit && access.seatLimit > 0 ? Math.min(100, (access.activeSeats / access.seatLimit) * 100) : 0;

  const header = (
    <View style={styles.header}>
      <ScreenTitle
        back="Settings"
        title="Users"
        right={
          <Pressable onPress={() => void users.refetch()} accessibilityRole="button" accessibilityLabel="Refresh" style={({ pressed }) => [styles.square, pressed && { opacity: 0.6 }]}>
            {users.isRefetching ? <ActivityIndicator color={colors.muted} /> : <Ionicons name="refresh" size={22} color={colors.ink} />}
          </Pressable>
        }
      />
      <Text style={styles.help}>Who can sign in, and what they can do.</Text>
      <ErrorBanner message={error} />

      {/* The plan's seats */}
      {access.seatLimit !== null ? (
        <View style={styles.seats}>
          <Text style={styles.seatsText}>
            <Text style={styles.bold}>{access.activeSeats} of {access.seatLimit} users used.</Text>{' '}
            {access.atSeatLimit ? 'Deactivate someone or contact support to add more.' : `${access.seatLimit - access.activeSeats} more can be added. Only active users count.`}
          </Text>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${seatShare}%`, backgroundColor: access.atSeatLimit ? colors.warnText : colors.brandText }]} />
          </View>
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder="Search name, email or mobile…"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search users"
          />
          {typed ? (
            <Pressable onPress={() => setTyped('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={filterCount ? `Filters, ${filterCount} on` : 'Filters'}
          style={({ pressed }) => [styles.square, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="options-outline" size={22} color={colors.ink} />
          {filterCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{filterCount}</Text></View> : null}
        </Pressable>
      </View>
      <View style={styles.chips}>
        {STATUS_CHIPS.map((chip) => {
          const active = filters.status === chip.value;
          const count = (users.data ?? []).filter((u) => chip.value === 'all' || (chip.value === 'active') === u.isActive).length;
          return (
            <Pressable
              key={chip.value}
              onPress={() => setFilters({ ...filters, status: chip.value })}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.chipText}>
                {chip.label} <Text style={{ color: colors.muted, fontWeight: '400' }}>{count}</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>
      {shown.length > 0 ? (
        <Text style={styles.count}>
          {shown.length} {shown.length === 1 ? 'user' : 'users'} · <Text style={styles.countBold}>{STATUS_LABEL[filters.status]}</Text>
        </Text>
      ) : null}
    </View>
  );

  if (users.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (users.error) {
    return (
      <Centered>
        <ErrorText message={users.error instanceof Error ? users.error.message : null} />
        <Button title="Try again" tone="secondary" onPress={() => void users.refetch()} />
      </Centered>
    );
  }

  return (
    <>
      <FlatList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.list}
        data={shown}
        keyExtractor={(u) => u.id}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <UserRow
            user={item}
            isMe={item.id === access.meId}
            onOpen={() => router.push({ pathname: '/more/users/[id]', params: { id: item.id } })}
            onActions={access.canManage(item) ? () => actions(item) : undefined}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No users found</Text>
            <Text style={styles.emptyText}>{typed || filterCount ? 'No one matches the search or filters.' : 'Invite the people who will use the app.'}</Text>
          </View>
        }
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={users.isRefetching} onRefresh={() => void users.refetch()} tintColor={colors.brandText} />}
      />
      <UserFilterSheet visible={sheet} value={filters} roles={roles.data ?? []} departments={departments.data ?? []} onChange={setFilters} onClose={() => setSheet(false)} />
      <ActionSheet visible={menu !== null} title={menu?.title} actions={menu?.actions ?? []} onClose={() => setMenu(null)} />
      <ResetPasswordSheet
        user={reset}
        onClose={() => setReset(null)}
        onDone={(message) => {
          setReset(null);
          notify(message);
        }}
      />
    </>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    list: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg * 2 },
    header: { gap: spacing.md, marginBottom: spacing.sm },
    square: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    help: { ...type.subhead, color: c.muted },
    seats: { backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.sm },
    seatsText: { ...type.subhead, color: c.muted },
    bold: { fontWeight: '700', color: c.ink },
    track: { height: 6, borderRadius: 3, backgroundColor: c.track, overflow: 'hidden' },
    bar: { height: 6, borderRadius: 3 },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, paddingHorizontal: spacing.md },
    searchInput: { ...type.body, flex: 1, color: c.ink, fontFamily: 'Inter_400Regular', paddingVertical: 10 },
    badge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    badgeText: { ...type.footnoteBold, color: '#FFFFFF' },
    chips: { flexDirection: 'row', gap: spacing.sm },
    chip: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, justifyContent: 'center' },
    chipActive: { borderColor: c.brandText, backgroundColor: c.brandTint },
    chipText: { ...type.subhead, fontWeight: '600', color: c.ink },
    count: { ...type.subhead, color: c.muted },
    countBold: { color: c.ink, fontWeight: '700' },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: c.divider },
    empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg * 2 },
    emptyTitle: { ...type.headline, color: c.ink },
    emptyText: { ...type.subhead, color: c.muted, textAlign: 'center' },
  });
