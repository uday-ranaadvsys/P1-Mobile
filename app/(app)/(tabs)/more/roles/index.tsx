import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Centered } from '@/components/Screen';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ErrorText } from '@/components/Text';
import { listRoles } from '@/features/roles/api';
import { isFullAccess } from '@/features/roles/matrix';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/** Roles & Permissions: every role with how many users have it. Tap one to see and change what it can do. */
export default function Roles() {
  const router = useRouter();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles });

  const header = (
    <View style={styles.header}>
      <ScreenTitle
        back="Settings"
        title="Roles & Permissions"
        right={
          <Pressable onPress={() => void roles.refetch()} accessibilityRole="button" accessibilityLabel="Refresh" style={({ pressed }) => [styles.square, pressed && { opacity: 0.6 }]}>
            {roles.isRefetching ? <ActivityIndicator color={colors.muted} /> : <Ionicons name="refresh" size={22} color={colors.ink} />}
          </Pressable>
        }
      />
      <Text style={styles.help}>Choose what each role can see and do.</Text>
    </View>
  );

  if (roles.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (roles.error) {
    return (
      <Centered>
        <ErrorText message={roles.error instanceof Error ? roles.error.message : 'Could not load the roles.'} />
        <Button title="Try again" tone="secondary" onPress={() => void roles.refetch()} />
      </Centered>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.list}
      data={roles.data ?? []}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => {
        const users = item._count?.users ?? 0;
        return (
          <Pressable
            onPress={() => router.push({ pathname: '/more/roles/[id]', params: { id: item.id } })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
          >
            <View style={styles.icon}>
              <Ionicons name={isFullAccess(item) ? 'lock-closed-outline' : 'shield-checkmark-outline'} size={22} color={colors.ink} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.sub} numberOfLines={2}>
                {users} {users === 1 ? 'user' : 'users'}{isFullAccess(item) ? ' · full access' : item.description ? ` · ${item.description}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        );
      }}
      ListEmptyComponent={<Text style={styles.empty}>No roles yet.</Text>}
      refreshControl={<RefreshControl refreshing={roles.isRefetching} onRefresh={() => void roles.refetch()} tintColor={colors.brandText} />}
    />
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    list: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg * 2 },
    header: { gap: spacing.md, marginBottom: spacing.sm },
    square: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    help: { ...type.subhead, color: c.muted },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 64 },
    icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.track, alignItems: 'center', justifyContent: 'center' },
    name: { ...type.headline, color: c.ink },
    sub: { ...type.subhead, color: c.muted },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: c.divider },
    empty: { ...type.subhead, color: c.muted, textAlign: 'center', paddingVertical: spacing.lg * 2 },
  });
