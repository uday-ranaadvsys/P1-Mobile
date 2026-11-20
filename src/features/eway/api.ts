import { api, apiWithMessage } from '@/api/client';

export type EwayUsage = {
  month: string;
  freeLimit: number;
  freeUsed: number;
  freeLeft: number;
  creditUsed: number;
  creditsLeft: number;
  totalCalls: number;
  failedCalls: number;
};

/** The company's e-way bill login as the server shows it: the password is never sent back. */
export type EwaySettings = {
  gstin: string | null;
  apiUsername: string | null;
  hasPassword: boolean;
  isVerified: boolean;
  lastTestedAt: string | null;
  lastTestMessage: string | null;
  usage: EwayUsage;
};

/** Admin only (the server refuses anyone else in its own words). */
export const getEwaySettings = () => api<EwaySettings>('/settings/eway-bill');

/**
 * One sign-in to the portal (counts as one call). With a typed username (and password) those are tested and saved only
 * if the portal accepts them; with none, the saved login is tested again.
 */
export const testEwayConnection = (body: { apiUsername?: string; apiPassword?: string }) =>
  apiWithMessage<EwaySettings>('/settings/eway-bill/test', { method: 'POST', body });
