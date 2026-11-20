import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { TODAY_GROUP_WORDS } from 'floman-shared/constants';
import { useLayoutEffect } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text } from 'react-native';
import { getGroupPage } from '@/features/approvals/api';
import type { TodayGroupKey } from '@/features/today/api';
import { TODAY_GROUP } from 'floman-shared/constants';
import { Button } from '@/components/Button';
import { Centered } from '@/components/Screen';
import { ErrorText } from '@/components/Text';
import { ItemCard } from '@/features/today/components/ItemCard';
import { openReview, PAGED_GROUPS } from '@/features/today/navigation';
import { spacing, useColors, useThemed, type Colors } from '@/theme';

const PAGE = 20;

/** Every document in "To approve" or "To fix", 20 at a time. */
export default function GroupList() {
  const { group: groupParam } = useLocalSearchParams<{ group: string }>();
  const group = groupParam as TodayGroupKey;
  const router = useRouter();
  const navigation = useNavigation();
  const colors = useColors();
  const styles = useThemed(makeStyles);
  const valid = PAGED_GROUPS.includes(group);

  useLayoutEffect(() => {
    if (valid) navigation.setOptions({ title: TODAY_GROUP_WORDS[group].name });
  }, [navigation, group, valid]);

  const query = useInfiniteQuery({
    queryKey: ['group', group],
    enabled: valid,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getGroupPage(group, pageParam, PAGE),
    getNextPageParam: (last) => (last.offset + last.items.length < last.count ? last.offset + last.items.length : undefined),
  });

  if (!valid) return <Centered><Text style={styles.muted}>Not available.</Text></Centered>;
  if (query.isLoading) return <Centered><ActivityIndicator color={colors.brandText} /></Centered>;
  if (query.error) {
    return (
      <Centered>
        <ErrorText message={query.error instanceof Error ? query.error.message : null} />
        <Button title="Try again" onPress={() => void query.refetch()} />
      </Centered>
    );
  }

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const count = query.data?.pages[0]?.count ?? 0;
  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
      data={items}
      keyExtractor={(item) => `${item.kind}:${item.id}`}
      renderItem={({ item }) => (
        <ItemCard
          group={group}
          item={item}
          onPress={() => openReview(router, group, item)}
          actionLabel={group === TODAY_GROUP.APPROVE ? 'Review' : undefined}
        />
      )}
      ListHeaderComponent={<Text style={styles.muted}>{count} in all. {TODAY_GROUP_WORDS[group].why}.</Text>}
      ListEmptyComponent={<Text style={styles.muted}>Nothing here.</Text>}
      ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={{ margin: spacing.md }} color={colors.brandText} /> : undefined}
      onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && void query.fetchNextPage()}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={colors.brandText} />}
    />
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    muted: { color: c.muted, fontSize: 14 },
  });
