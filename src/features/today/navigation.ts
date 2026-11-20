import type { useRouter } from 'expo-router';
import { TODAY_GROUP } from 'floman-shared/constants';
import type { TodayGroupKey, TodayItem } from '@/features/today/api';

/** The groups the server pages in full (GET /today/group), and the ones the phone opens documents from. */
export const PAGED_GROUPS: TodayGroupKey[] = [TODAY_GROUP.APPROVE, TODAY_GROUP.FIX];

/** Opens a document's review screen from a Today list. */
export function openReview(router: ReturnType<typeof useRouter>, group: TodayGroupKey, item: TodayItem) {
  router.push({
    pathname: '/document/[kind]/[id]',
    params: {
      kind: item.kind,
      id: item.id,
      group,
      number: item.number,
      party: item.party ?? '',
      by: item.by ?? '',
      note: item.note ?? '',
      date: item.date ?? '',
    },
  });
}
