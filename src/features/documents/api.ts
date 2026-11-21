import { DOCUMENT_API_PATHS, type DocumentType } from 'floman-shared/documentTypes';
import { api } from '@/api/client';

/** A document kind's API path, from the shared list (shared/documentTypes.ts). */
export const documentPath = (kind: string) => {
  const path = DOCUMENT_API_PATHS[kind as DocumentType];
  if (!path) throw new Error(`No API path for ${kind}`);
  return path;
};

/** One line of a document as the review screen reads it (the same names on every kind). */
export type DocumentLine = {
  id: string;
  partName: string;
  partDescription: string | null;
  hsn: string | null;
  qty: number | string;
  uom: string;
  unitPrice: number | string;
  discount: number | string;
  discountType: string;
  taxRate: number | string;
  totalAmount: number | string;
};

/** A document (GET <base>/:id): the fields every kind shares. Money arrives as text ("1180.00"). */
export type DocumentDetail = {
  id: string;
  status: string;
  vendor?: { name: string } | null;
  items?: DocumentLine[];
  subtotal?: number | string | null;
  /** Quotation and Sales Order keep their subtotal here. */
  totalAmount?: number | string | null;
  taxAmount?: number | string | null;
  grandTotal?: number | string | null;
  notes?: string | null;
  terms?: string | null;
  approvalRemarks?: string | null;
  billAttachmentUrl?: string | null;
} & Record<string, unknown>;

export const getDocument = (kind: string, id: string) => api<DocumentDetail>(`${documentPath(kind)}/${id}`);

// ── Pieces every document form shares: numbering series, saved notes and terms, the company's own fields ──

const query = (params: Record<string, string | number | undefined>) => {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

/** One numbering series a new document can take, with the number it gives next (GET /sequences/options). */
export type SeriesOption = { id: string; name: string; prefix: string; isDefault: boolean; nextNumber: string };

/** The active series of this financial year for a kind of document; with a location, only that place's series. */
export const listSeries = (documentType: string, locationId: string | null) =>
  api<SeriesOption[]>(`/sequences/options${query({ documentType, locationId: locationId ?? undefined })}`);

/** A saved note or saved terms (GET /templates/notes, /templates/terms): text to start a document's own from. */
export type TextTemplate = { id: string; title?: string | null; name?: string | null; content?: string | null; termsAndConditions?: string | null; isDefault?: boolean };

export const listTextTemplates = (kind: 'notes' | 'terms', documentType: string) => api<TextTemplate[]>(`/templates/${kind}${query({ documentType })}`);

/** One of the company's own fields for a kind of document. */
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

/** The company's own fields for a kind of document (GET /custom-fields). */
export const listCustomFields = (documentType: string) => api<CustomFieldDefinition[]>(`/custom-fields?documentType=${documentType}`);
