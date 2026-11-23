import { api } from '@/api/client';

/** An Indent line still to order (GET /indents/pending-items). */
export type PendingIndentItem = {
  id: string;
  indentId: string;
  partId?: string | null;
  partName: string;
  partCode?: string | null;
  partDescription?: string | null;
  hsn?: string | null;
  qty: number;
  orderedQty: number;
  pendingQty: number;
  uom: string;
  estimatedUnitPrice: number;
  /** The part's GST rate (0 for a line with no part). */
  taxRate: number;
  estimatedTotal: number;
  requiredByDate?: string | null;
  notes?: string | null;
  status: string;
  indent: {
    id: string;
    indentNumber: string;
    priority: string;
    requiredByDate?: string | null;
    projectName?: string | null;
    projectCode?: string | null;
    reference?: string | null;
    /** Where the Indent is needed (empty: the registered address). */
    shippingLocationId?: string | null;
    status: string;
    createdAt: string;
    department?: { id: string; name: string; code?: string | null } | null;
    createdBy?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  };
};

export type PendingStats = {
  totalPendingIndents: number;
  totalPendingItems: number;
  urgentItemsCount: number;
  pastRequiredByCount: number;
  totalPendingValue: number;
};

export type PendingFilters = { search?: string; departmentId?: string; priority?: string; late?: boolean };

const query = (params: Record<string, string | undefined>) => {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

/** The waiting lines, and the cards' counts (the search and department count every line; priority and late only narrow what is shown). */
export const listPendingItems = (f: PendingFilters) =>
  api<{ items: PendingIndentItem[]; kpis: PendingStats }>(`/indents/pending-items${query({ search: f.search, departmentId: f.departmentId, priority: f.priority, late: f.late ? 'true' : undefined })}`);
