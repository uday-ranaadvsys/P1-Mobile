import type { DocumentType } from 'floman-shared/documentTypes';
import { TODAY_GROUP } from 'floman-shared/constants';
import { api } from '@/api/client';

export type TodayGroupKey = (typeof TODAY_GROUP)[keyof typeof TODAY_GROUP];

/** One row of a Today group (server: services/today.service.ts TodayItem). Dates arrive as ISO text. */
export type TodayItem = {
  kind: DocumentType | string;
  id: string;
  number: string;
  party: string | null;
  partyId: string | null;
  status: string;
  amount: number | null;
  date: string | null;
  by: string | null;
  note: string | null;
  lines: number | null;
};

export type TodayGroup = { key: TodayGroupKey; count: number; items: TodayItem[] };

/** Something the user did today: a document moved on, or (kind null) a payment recorded. */
export type DoneEntry = {
  kind: DocumentType | null;
  id: string;
  number: string | null;
  action: string;
  party: string | null;
  amount: number | null;
  paymentType: string | null;
  at: string;
};

export type TodayResult = { groups: TodayGroup[]; cleared: number; done: DoneEntry[] };

export const getToday = () => api<TodayResult>('/today');

/** Money pulse (GET /today/panel): only the figures the user may see are there. */
export type MoneyPulse = {
  collectedToday?: number;
  netRevenue?: { month: number; lastMonth: number };
  receivable?: { total: number; overdue: number };
  payable?: { total: number; overdue: number };
};
export type TodayPanel = { money: MoneyPulse };

export const getPanel = () => api<TodayPanel>('/today/panel');
