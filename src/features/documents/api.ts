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
