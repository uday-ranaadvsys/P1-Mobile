import { api, apiWithMessage } from '@/api/client';
import { documentPath } from '@/features/documents/api';
import type { TodayGroupKey, TodayItem } from '@/features/today/api';

/** A page of "To approve" or "To fix" (GET /today/group): same items and same visibility as Today. */
export type GroupPage = { key: TodayGroupKey; count: number; items: TodayItem[]; offset: number; limit: number };

export const getGroupPage = (key: TodayGroupKey, offset: number, limit: number) =>
  api<GroupPage>(`/today/group?key=${key}&offset=${offset}&limit=${limit}`);

/** The lines the server names when an Invoice or GRN goes over its order (409 OVER_ORDER). */
export type OverOrderDetails = { lines: { partName: string; ordered: number; total: number }[]; verb: string; source: string };

export const approveDocument = (kind: string, id: string, confirmOverOrder = false) =>
  apiWithMessage<unknown>(`${documentPath(kind)}/${id}/approve`, { method: 'POST', body: confirmOverOrder ? { confirmOverOrder } : {} });

export const returnDocument = (kind: string, id: string, remarks: string) =>
  apiWithMessage<unknown>(`${documentPath(kind)}/${id}/return`, { method: 'POST', body: { remarks } });
