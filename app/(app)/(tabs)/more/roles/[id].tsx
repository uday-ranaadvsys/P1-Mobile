import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ErrorBanner, SectionHeader } from '@/components/FormParts';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { listPermissions, listRoles, saveRolePermissions } from '@/features/roles/api';
import { RoleHistorySheet } from '@/features/roles/components/RoleHistorySheet';
import { buildGroups, grantable, isFullAccess } from '@/features/roles/matrix';
import { useUserAccess } from '@/features/users/useUserAccess';
import { notify } from '@/lib/notify';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One role: what it can do, screen by screen, as the web's matrix (View, Create, Edit, Delete, Approve, See prices).
 * Only an Admin changes the ticks, and never the full-access role. The server enforces the same.
 */
export default function RoleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const queryClient = useQueryClient();
  const access = useUserAccess();

  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: listPermissions });
  const role = roles.data?.find((r) => r.id === id);

  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<string | null>(null);
  const [history, setHistory] = useState(false);

  // Start from what is saved (when the role arrives, and again after a save).
  useEffect(() => {
    if (role) setDraft(new Set(role.permissions.map((p) => p.id)));
  }, [role]);

  const locked = isFullAccess(role);
  const editable = access.isAdmin && !access.readOnly && !locked;
  const all = useMemo(() => grantable(permissions.data ?? []), [permissions.data]);
  const groups = useMemo(() => buildGroups(all), [all]);

  const changed = useMemo(() => {
    if (!role || locked) return false;
    const saved = new Set(role.permissions.map((p) => p.id));
    return saved.size !== draft.size || [...draft].some((p) => !saved.has(p));
  }, [role, draft, locked]);

  const save = useMutation({
    mutationFn: () => saveRolePermissions(id!, Array.from(draft)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      setBanner(null);
      notify(`${role?.name} saved.`);
    },
    onError: (e) => setBanner(message(e)),
  });

  const flip = (permissionId: string) => {
    if (!editable) return;
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  if (roles.isLoading || permissions.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  const loadError = roles.error ?? permissions.error;
  if (loadError || !role) {
    return (
      <Centered>
        <ErrorText message={loadError ? message(loadError) : 'Role not found'} />
        <Button title="Try again" tone="secondary" onPress={() => { void roles.refetch(); void permissions.refetch(); }} />
      </Centered>
    );
  }

  const users = role._count?.users ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenTitle back="Roles" />
        <ErrorBanner message={banner} />

        <View style={{ gap: spacing.xs }}>
          <Text style={styles.name} accessibilityRole="header">{role.name}</Text>
          <Text style={styles.sub}>
            {users} {users === 1 ? 'user' : 'users'}
            {locked ? " · full access, can't be changed" : role.description ? ` · ${role.description}` : ''}
          </Text>
          <Pressable onPress={() => setHistory(true)} accessibilityRole="button" style={({ pressed }) => [styles.historyLink, pressed && { opacity: 0.6 }]}>
            <Ionicons name="time-outline" size={18} color={colors.brandText} />
            <Text style={styles.historyText}>History</Text>
          </Pressable>
        </View>

        {editable ? (
          <View style={styles.quick}>
            <Button title="Allow all" tone="secondary" style={{ flex: 1 }} onPress={() => setDraft(new Set(all.map((p) => p.id)))} />
            <Button title="Clear all" tone="secondary" style={{ flex: 1 }} onPress={() => setDraft(new Set())} />
          </View>
        ) : null}

        {groups.map((group) => (
          <View key={group.name}>
            <SectionHeader>{group.name}</SectionHeader>
            <View style={styles.card}>
              {group.rows.map((row, i) => (
                <View key={row.resource} style={[styles.screenRow, i > 0 && styles.screenDivider]}>
                  <Text style={styles.screen}>{row.screen}</Text>
                  <View style={styles.ticks}>
                    {row.cells.map((cell) => {
                      if (!cell.permission) return null; // the screen has no such permission
                      const on = locked || draft.has(cell.permission.id);
                      const permissionId = cell.permission.id;
                      return (
                        <Pressable
                          key={cell.label}
                          onPress={() => flip(permissionId)}
                          disabled={!editable}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on, disabled: !editable }}
                          accessibilityLabel={`${row.screen}: ${cell.label}`}
                          style={({ pressed }) => [styles.tick, on && styles.tickOn, locked && { opacity: 0.6 }, pressed && { opacity: 0.6 }]}
                        >
                          {on ? <Ionicons name="checkmark" size={16} color={colors.ink} /> : null}
                          <Text style={[styles.tickText, on && { color: colors.ink }]}>{cell.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {editable ? (
        <View style={styles.bar}>
          {changed ? <Button title="Undo changes" tone="secondary" style={{ flex: 1 }} onPress={() => setDraft(new Set(role.permissions.map((p) => p.id)))} disabled={save.isPending} /> : null}
          <Button title="Save changes" style={{ flex: 1 }} onPress={() => save.mutate()} busy={save.isPending} disabled={!changed} />
        </View>
      ) : null}

      <RoleHistorySheet role={history ? role : null} onClose={() => setHistory(false)} />
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    name: { ...type.title1, color: c.ink },
    sub: { ...type.subhead, color: c.muted },
    historyLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, alignSelf: 'flex-start' },
    historyText: { ...type.subhead, fontWeight: '600', color: c.brandText },
    quick: { flexDirection: 'row', gap: spacing.md },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, paddingHorizontal: spacing.md },
    screenRow: { paddingVertical: spacing.md, gap: spacing.sm },
    screenDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    screen: { ...type.headline, color: c.ink },
    ticks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    tick: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface },
    tickOn: { borderColor: c.brandText, backgroundColor: c.brandTint },
    tickText: { ...type.subhead, fontWeight: '600', color: c.muted },
    bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.outline },
  });
