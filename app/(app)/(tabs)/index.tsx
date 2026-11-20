import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { TODAY_GROUP, TODAY_GROUP_WORDS } from 'floman-shared/constants';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Centered } from '@/components/Screen';
import { ErrorText } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { getPanel, getToday, type TodayGroup, type TodayGroupKey } from '@/features/today/api';
import { ItemCard } from '@/features/today/components/ItemCard';
import { MoneyCard } from '@/features/today/components/MoneyCard';
import { openReview, PAGED_GROUPS } from '@/features/today/navigation';
import { doneText } from '@/features/today/text';
import { formatDate, greeting, weekdayName } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';

/**
 * Today, as the web shows it, arranged for a phone: the greeting and what needs you, how much of the day is
 * done, the money figures, filter chips, then each group with its items (oldest first), and what you did.
 * Drafts are last and don't count toward the day. Pull down to refresh.
 */
export default function Today() {
  const { user } = useSession();
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const today = useQuery({ queryKey: ['today'], queryFn: getToday });
  // The money figures are extra: without them (or without permission) the list still works.
  const panel = useQuery({ queryKey: ['panel'], queryFn: getPanel });
  const [filter, setFilter] = useState<TodayGroupKey | null>(null);

  if (today.isLoading) return <Centered><Text style={styles.muted}>Getting your day ready…</Text></Centered>;
  if (today.error || !today.data) {
    return (
      <Centered>
        <ErrorText message={today.error instanceof Error ? today.error.message : null} />
        <Button title="Try again" tone="secondary" onPress={() => void today.refetch()} />
      </Centered>
    );
  }

  const data = today.data;
  const now = new Date();
  const groups = data.groups;
  const drafts = groups.find((g) => g.key === TODAY_GROUP.DRAFTS)?.count ?? 0;
  const toGo = groups.reduce((sum, g) => sum + (g.key === TODAY_GROUP.DRAFTS ? 0 : g.count), 0);
  const { cleared } = data;
  const progress = cleared + toGo === 0 ? 0 : Math.round((cleared / (cleared + toGo)) * 100);
  const shown = filter ? groups.filter((g) => g.key === filter) : groups;
  const headline = toGo === 0 ? 'Nothing needs you right now.' : `${toGo} ${toGo === 1 ? 'thing needs' : 'things need'} you today.`;
  const money = panel.data?.money;
  const refresh = () => {
    void today.refetch();
    void panel.refetch();
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={today.isRefetching} onRefresh={refresh} tintColor={colors.brandText} />}
    >
      {/* What this screen is for, first: the day, the greeting, and how much needs you. */}
      <View style={styles.intro}>
        <Text style={styles.date}>{weekdayName(now)}, {formatDate(now)}</Text>
        <Text style={styles.headline} accessibilityRole="header">
          {greeting(now)}{user?.firstName ? `, ${user.firstName}` : ''}.{'\n'}{headline}
        </Text>
        {toGo > 0 ? <Text style={styles.sub}>Oldest first.{drafts > 0 ? ' Drafts are listed separately.' : ''}</Text> : null}
      </View>

      <View style={styles.card} accessible accessibilityRole="progressbar" accessibilityLabel={`Today's progress, ${cleared} of ${cleared + toGo} done`}>
        <View style={styles.progressHead}>
          <Text style={styles.cardTitle}>Today's progress</Text>
          <Text style={styles.sub}>{cleared} of {cleared + toGo} done</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.bar, { width: `${Math.max(progress, cleared > 0 ? 4 : 0)}%` }]} />
        </View>
      </View>

      {money && Object.keys(money).length > 0 ? <MoneyCard money={money} /> : null}

      {groups.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // The chips line up with the content on the left and scroll out to the screen edge.
          style={styles.chipScroll}
          contentContainerStyle={styles.chips}
        >
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
        <View style={[styles.card, styles.centerCard]}>
          <Text style={styles.cardTitle}>All cleared</Text>
          <Text style={styles.sub}>You cleared {cleared} {cleared === 1 ? 'thing' : 'things'} today.</Text>
        </View>
      ) : null}

      {groups.length === 0 && cleared === 0 ? (
        <View style={[styles.card, styles.centerCard]}>
          <Text style={styles.cardTitle}>You're all clear.</Text>
          <Text style={[styles.sub, { textAlign: 'center' }]}>Nothing is waiting on you. New approvals, payments due and deliveries show up here.</Text>
        </View>
      ) : null}

      {shown.map((group) => <GroupSection key={group.key} group={group} />)}

      {data.done.length > 0 ? (
        <Text style={styles.sub}>
          {hide.hidden
            ? `Done today: ${cleared} ${cleared === 1 ? 'thing' : 'things'}.`
            : `Done today: ${data.done.map(doneText).join(', ')}${cleared > data.done.length ? ` and ${cleared - data.done.length} more` : ''}.`}
        </Text>
      ) : null}

    </ScrollView>
  );
}

/** A filter chip: 44 pt tall; the picked one has a coral border and a light tint, as on the web. */
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useThemed(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.6 }]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** A group: its name, why it is there, then its items as cards. The groups the server pages open in full. */
function GroupSection({ group }: { group: TodayGroup }) {
  const styles = useThemed(makeStyles);
  const router = useRouter();
  const words = TODAY_GROUP_WORDS[group.key];
  const paged = PAGED_GROUPS.includes(group.key);
  const more = group.count - group.items.length;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{words.name}</Text>
        <Text style={styles.sub}>{words.why}</Text>
      </View>
      {group.items.map((item) => (
        <ItemCard key={`${item.kind}:${item.id}`} group={group.key} item={item} onOpen={paged ? () => openReview(router, group.key, item) : undefined} />
      ))}
      {more > 0 ? (
        paged ? (
          <Pressable
            onPress={() => router.push({ pathname: '/approvals/[group]', params: { group: group.key } })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.seeAll, pressed && { opacity: 0.5 }]}
          >
            <Text style={styles.seeAllText}>See all {group.count}</Text>
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
    // 16 pt side margins; 24 pt between sections, 12 pt between related things (8-point grid).
    page: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.lg * 2 },
    intro: { gap: spacing.xs },
    date: { ...type.footnote, color: c.muted },
    headline: { ...type.title1, color: c.ink },
    sub: { ...type.subhead, color: c.muted },
    muted: { ...type.subhead, color: c.muted },
    faint: { ...type.footnote, color: c.faint },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.outline, padding: spacing.md, gap: spacing.sm },
    centerCard: { alignItems: 'center', paddingVertical: spacing.lg },
    cardTitle: { ...type.headline, color: c.ink },
    progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    track: { height: 8, borderRadius: 4, backgroundColor: c.track, overflow: 'hidden' },
    bar: { height: 8, borderRadius: 4, backgroundColor: c.receive },
    chipScroll: { marginHorizontal: -spacing.md, flexGrow: 0 },
    chips: { paddingHorizontal: spacing.md, gap: spacing.sm },
    chip: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface, justifyContent: 'center' },
    chipActive: { borderColor: c.brandText, backgroundColor: c.brandTint },
    chipText: { ...type.subhead, fontWeight: '600', color: c.muted },
    chipTextActive: { color: c.ink },
    section: { gap: spacing.sm + spacing.xs },
    sectionHead: { gap: 2 },
    sectionTitle: { ...type.title3, color: c.ink },
    seeAll: { minHeight: 44, justifyContent: 'center' },
    seeAllText: { ...type.headline, color: c.brandText },
  });
