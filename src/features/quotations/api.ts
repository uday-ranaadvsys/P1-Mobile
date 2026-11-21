import { api, apiWithMessage, type Meta } from '@/api/client';

export type QuotationItem = {
  id: string;
  partName: string;
  partCode?: string | null;
  partDescription?: string | null;
  scopeOfWork?: string | null;
  hsn?: string | null;
  qty: number | string;
  freeQty?: number | string;
  convertedQty?: number | string;
  uom: string;
  unitPrice: number | string;
  discount?: number | string | null;
  discountType?: string | null;
  taxRate: number | string;
  taxableAmount?: number | string | null;
  taxAmount?: number | string | null;
  totalAmount?: number | string | null;
  status?: string;
  approverRemarks?: string | null;
};

export type HistoryEntry = {
  id: string;
  action: string;
  createdAt: string;
  changedBy?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  newValues?: Record<string, unknown> | null;
};

type PartyAddressText = { text?: string } | null;

/** A quotation as the list and its detail read it (server: Quotation). Money arrives as text or numbers. */
export type Quotation = {
  id: string;
  quotationNumber: string;
  status: string;
  issueDate?: string;
  quotationDate?: string;
  validityDate?: string | null;
  poNumber?: string | null;
  projectName?: string | null;
  projectCode?: string | null;
  clientName?: string | null;
  notes?: string | null;
  terms?: string | null;
  termsAndConditions?: string | null;
  /** The taxable amount. */
  totalAmount: number | string;
  taxAmount: number | string;
  grandTotal: number | string;
  extraDiscount?: number | string | null;
  discountAmount?: number | string | null;
  tcsRate?: number | string | null;
  tcsAmount?: number | string | null;
  gstTdsRate?: number | string | null;
  gstTdsAmount?: number | string | null;
  incomeTdsRate?: number | string | null;
  incomeTdsAmount?: number | string | null;
  approvalRemarks?: string | null;
  approvedAt?: string | null;
  returnedAt?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  editedAt?: string | null;
  editedBy?: { firstName?: string | null; lastName?: string | null } | null;
  approvedBy?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  createdAt: string;
  vendor?: { id: string; name: string; gstin?: string | null; city?: string | null; state?: string | null } & Record<string, unknown> | null;
  billTo?: PartyAddressText;
  shipTo?: PartyAddressText;
  customFields?: Record<string, unknown> | null;
  items?: QuotationItem[];
  salesOrders?: { id: string; soNumber: string; status: string; grandTotal: number | string; orderDate?: string; createdAt?: string }[];
  proformaInvoices?: { id: string; proformaNumber: string; status: string; grandTotal: number | string; proformaDate: string }[];
  auditLogs?: HistoryEntry[];
};

/** The cards' counts and money on the web's Quotations screen (the list's meta.stats). */
export type QuotationStats = {
  total: number;
  draft: number;
  pendingApproval: number;
  approverAccepted: number;
  approverReturned: number;
  customerAccepted: number;
  customerPartiallyAccepted: number;
  customerRejected: number;
  cancelled: number;
  totalValue: number;
  draftValue: number;
  approvedValue: number;
  customerAcceptedValue: number;
  acceptedValueRate: number | null;
};

export type QuotationFilters = { search?: string; status?: string; sort?: string; amount?: string; from?: string; to?: string; vendorId?: string };

const query = (params: Record<string, string | number | undefined>) => {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

/** One page of quotations and the cards' counts (GET /quotations). */
export async function listQuotations(page: number, limit: number, f: QuotationFilters) {
  const { data, meta } = await apiWithMessage<Quotation[]>(`/quotations${query({ page, limit, ...f })}`);
  return { rows: data, meta: meta as (Meta & { stats?: QuotationStats }) | null };
}

/** One quotation with its lines, linked documents and history (GET /quotations/:id). */
export const getQuotation = (id: string) => api<Quotation>(`/quotations/${id}`);

/** One numbering series a new document can take, with the number it gives next (GET /sequences/options). */
export type SeriesOption = { id: string; name: string; prefix: string; isDefault: boolean; nextNumber: string };

/** The active series of this financial year for a kind of document; with a location, only that place's series. */
export const listSeries = (documentType: string, locationId: string | null) =>
  api<SeriesOption[]>(`/sequences/options${query({ documentType, locationId: locationId ?? undefined })}`);

/** A saved note or saved terms (GET /templates/notes, /templates/terms): text to start a document's own from. */
export type TextTemplate = { id: string; title?: string | null; name?: string | null; content?: string | null; termsAndConditions?: string | null; isDefault?: boolean };

export const listTextTemplates = (kind: 'notes' | 'terms', documentType: string) => api<TextTemplate[]>(`/templates/${kind}${query({ documentType })}`);

export type CustomFieldDefinition = {
  id: string;
  fieldKey: string;
  displayLabel: string;
  fieldType: string;
  isConfidential: boolean;
  sortOrder: number;
  isRequired?: boolean;
  defaultValue?: string | null;
  maxLength?: number | null;
  dropdownOptions?: string[] | null;
};

/** What a save sends (server: CreateQuotationSchema). Built in features/quotations/form.ts. */
export type QuotationPayload = Record<string, unknown>;

/** Saves a new Quotation: as a draft, for approval, or approved (the payload's status). */
export const createQuotation = (body: QuotationPayload) => api<Quotation>('/quotations', { method: 'POST', body });

/** The company's own fields for a kind of document (GET /custom-fields). */
export const listCustomFields = (documentType: string) => api<CustomFieldDefinition[]>(`/custom-fields?documentType=${documentType}`);
