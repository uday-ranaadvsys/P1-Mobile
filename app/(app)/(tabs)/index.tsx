import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { TODAY_GROUP, TODAY_GROUP_WORDS } from 'floman-shared/constants';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getToday, type TodayGroup, type TodayGroupKey, type TodayItem } from '@/features/today/api';
import { useSession } from '@/features/auth/session';
import { Button } from '@/components/Button';
import { Centered } from '@/components/Screen';
import { ErrorText } from '@/components/Text';
import { formatDate, greeting, weekdayName } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { ItemCard } from '@/features/today/components/ItemCard';
import { openReview, PAGED_GROUPS } from '@/features/today/navigation';
import { doneText } from '@/features/today/text';
import { spacing, useColors, useThemed, type Colors } from '@/theme';

/**
 * Today, like the web and the design: a big greeting, search, how much of the day is done, filter
 * chips, then each group with its items as cards (oldest first). Drafts last; they don't count.
 */
export default function Today() {
  const { user } = useSession();
  const router = useRouter();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const { data, error, isLoading, isRefetching, refetch } = useQuery({ queryKey: ['today'], queryFn: getToday });
  const [filter, setFilter] = useState<TodayGroupKey | null>(null);

  if (isLoading) return <Centered><Text style={styles.muted}>Getting your day ready…</Text></Centered>;
  if (error || !data) {
    return (
      <Centered>
        <ErrorText message={error instanceof Error ? error.message : null} />
        <Button title="Try again" onPress={() => void refetch()} />
      </Centered>
    );
  }

  const now = new Date();
  const groups = data.groups;
  const drafts = groups.find((g) => g.key === TODAY_GROUP.DRAFTS)?.count ?? 0;
  const toGo = groups.reduce((sum, g) => sum + (g.key === TODAY_GROUP.DRAFTS ? 0 : g.count), 0);
  const { cleared } = data;
  const progress = cleared + toGo === 0 ? 0 : Math.round((cleared / (cleared + toGo)) * 100);
  const shown = filter ? groups.filter((g) => g.key === filter) : groups;
  const headline = toGo === 0 ? 'Nothing needs you right now.' : `${toGo} ${toGo === 1 ? 'thing needs' : 'things need'} you today.`;
  const name = user?.firstName ? `, ${user.firstName}` : '';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.brandText} />}
    >
      <View style={{ gap: 6 }}>
        <View style={styles.row}>
          <Text style={styles.muted}>{weekdayName(now)}, {formatDate(now)}</Text>
          <Pressable onPress={() => void refetch()} hitSlop={10} accessibilityLabel="Refresh">
            <Ionicons name="refresh" size={20} color={colors.muted} />
          </Pressable>
        </View>
        <Text style={styles.headline}>{greeting(now)}{name}.{'\n'}{headline}</Text>
        {toGo > 0 ? <Text style={styles.muted}>Oldest first.{drafts > 0 ? ' Drafts are listed separately.' : ''}</Text> : null}
      </View>

      <Pressable style={styles.search} onPress={() => router.push('/search')}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <Text style={styles.searchText}>Search documents, parties, parts…</Text>
      </Pressable>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.cardTitle}>Today's progress</Text>
          <Text style={styles.muted}>{cleared} of {cleared + toGo} done</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.bar, { width: `${Math.max(progress, cleared > 0 ? 4 : 0)}%` }]} />
        </View>
      </View>

      {groups.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          <Chip active={filter === null} onPress={() => setFilter(null)} label={`All ${toGo}`} />
          {groups.map((g) => (
            <Chip
              key={g.key}
              active={filter === g.key}
              onPress={() => setFilter(filter === g.key ? null : g.key)}
              label={`${TODAY_GROUP_WORDS[g.key].short} ${g.count}`}
            />
          ))}
        </ScrollView>
      ) : null}

      {toGo === 0 && cleared > 0 ? (
        <View style={[styles.card, { alignItems: 'center', gap: 4 }]}>
          <Text style={styles.cardTitle}>All cleared</Text>
          <Text style={styles.muted}>You cleared {cleared} {cleared === 1 ? 'thing' : 'things'} today.</Text>
        </View>
      ) : null}

      {groups.length === 0 && cleared === 0 ? (
        <View style={[styles.card, { alignItems: 'center', gap: 4, paddingVertical: spacing.lg }]}>
          <Text style={styles.cardTitle}>You're all clear.</Text>
          <Text style={[styles.muted, { textAlign: 'center' }]}>Nothing is waiting on you. New approvals, payments due and deliveries show up here.</Text>
        </View>
      ) : null}

      {shown.map((group) => <GroupSection key={group.key} group={group} />)}

      {data.done.length > 0 ? (
        <Text style={styles.muted}>
          {hide.hidden
            ? `Done today: ${data.cleared} ${data.cleared === 1 ? 'thing' : 'things'}.`
            : `Done today: ${data.done.map(doneText).join(', ')}${data.cleared > data.done.length ? ` and ${data.cleared - data.done.length} more` : ''}.`}
        </Text>
      ) : null}
    </ScrollView>
  );
}

/** A filter chip: a pill; the picked one has a coral border and a light tint, as in the design. */
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useThemed(makeStyles);
  return <Text onPress={onPress} style={[styles.chip, active && styles.chipActive]}>{label}</Text>;
}

function GroupSection({ group }: { group: TodayGroup }) {
  const styles = useThemed(makeStyles);
  const router = useRouter();
  const words = TODAY_GROUP_WORDS[group.key];
  const paged = PAGED_GROUPS.includes(group.key);
  const more = group.count - group.items.length;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.groupHead}>
        <Text style={styles.groupName}>{words.name}</Text>
        <Text style={styles.muted}> · {words.why}</Text>
      </Text>
      {group.items.map((item: TodayItem) => (
        <ItemCard
          key={`${item.kind}:${item.id}`}
          group={group.key}
          item={item}
          onPress={paged ? () => openReview(router, group.key, item) : undefined}
          actionLabel={group.key === TODAY_GROUP.APPROVE ? 'Review' : undefined}
        />
      ))}
      {more > 0 ? (
        paged ? (
          <Pressable onPress={() => router.push({ pathname: '/approvals/[group]', params: { group: group.key } })}>
            <Text style={styles.seeAll}>See all {group.count}</Text>
          </Pressable>
        ) : (
          <Text style={styles.faint}>and {more} more</Text>
        )
      ) : null}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg * 2 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    muted: { color: c.muted, fontSize: 14 },
    faint: { color: c.faint, fontSize: 13 },
    headline: { fontSize: 28, fontWeight: '800', color: c.ink, lineHeight: 34 },
    search: {
      flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.outline, paddingHorizontal: spacing.md, paddingVertical: 15,
    },
    searchText: { color: c.muted, fontSize: 16 },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.sm },
    cardTitle: { fontSize: 16, fontWeight: '700', color: c.ink },
    track: { height: 6, borderRadius: 3, backgroundColor: c.track, overflow: 'hidden' },
    bar: { height: 6, borderRadius: 3, backgroundColor: c.receive },
    chip: {
      paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: c.outline,
      backgroundColor: c.surface, color: c.ink, fontSize: 15, fontWeight: '600', overflow: 'hidden',
    },
    chipActive: { borderColor: c.brandText, backgroundColor: c.brandTint },
    groupHead: { marginTop: spacing.sm },
    groupName: { fontSize: 20, fontWeight: '800', color: c.ink },
    seeAll: { color: c.brandText, fontSize: 15, fontWeight: '700', paddingVertical: 6 },
  });
