import { PRIMARY } from '@/features/parties/places';
import type { Party } from '@/features/parties/api';
import { customPayload, type FormLine } from '@/features/quotations/form';
import type { CustomFieldDefinition } from '@/features/documents/api';
import { formFromPurchaseOrder, DEFAULT_PAYMENT_TERMS, type PurchaseOrderHeader } from '@/features/purchase-orders/form';
import type { PurchaseOrder } from '@/features/purchase-orders/api';
import type { PurchaseIndent } from './api';

/** A Purchase Indent's header is a Purchase Order's, without the vendor's quote (the form leaves that box out). */
export type PurchaseIndentHeader = PurchaseOrderHeader;

/** The web's extra check: a Purchase Indent needs its expected delivery date. */
export const EXPECTED_DELIVERY_REQUIRED = 'Expected delivery date is required';

const num = (text: string) => (Number.isFinite(parseFloat(text)) ? parseFloat(text) : 0);

/** The line as the server takes it; the Indent lines it orders only for a new line (a saved line keeps its own). */
const linePayload = (l: FormLine) => ({
  ...(l.lineId && { id: l.lineId }),
  partId: l.partId || null,
  partCode: l.partCode || null,
  partName: l.partName,
  partDescription: l.scope.trim() || null,
  scopeOfWork: l.scope.trim() || null,
  hsn: l.hsn || null,
  qty: num(l.qty),
  freeQty: num(l.freeQty),
  uom: l.uom,
  unitPrice: num(l.rate),
  discount: num(l.discount),
  discountType: l.discountType,
  taxRate: l.taxRate,
  ...(l.indentRef ? { indentRef: l.indentRef } : {}),
  ...(!l.lineId && l.indentAllocations?.length ? { indentAllocations: l.indentAllocations.map((a) => ({ indentItemId: a.indentItemId, allocatedQty: Number(a.allocatedQty) })) } : {}),
});

/** Everything a save sends (the web's payload), for the status chosen: Draft or waiting for approval. */
export function buildPayload(input: {
  header: PurchaseIndentHeader;
  status: string;
  sendSeries: boolean;
  prNumber?: string;
  lines: FormLine[];
  fields: CustomFieldDefinition[];
  extraDiscount: string;
  isRoundOff: boolean;
}) {
  const { header: h } = input;
  return {
    prNumber: input.prNumber,
    seriesId: input.sendSeries ? h.seriesId : undefined,
    vendorId: h.party?.id,
    shippingAddressId: h.dispatchFromId !== PRIMARY ? h.dispatchFromId : null,
    billingAddressId: h.billingAddressId || null,
    billingLocationId: h.billingLocationId || null,
    shippingLocationId: h.shippingLocationId || null,
    orderDate: h.orderDate,
    deliveryDueDate: h.deliveryDueDate || null,
    expectedDeliveryDate: h.expectedDeliveryDate,
    paymentTerms: h.paymentTerms || DEFAULT_PAYMENT_TERMS,
    projectName: h.projectName || null,
    projectCode: h.projectCode || null,
    notes: h.notes || null,
    terms: h.terms || null,
    extraDiscount: num(input.extraDiscount),
    isRoundOff: input.isRoundOff,
    status: input.status,
    customFields: customPayload(input.fields, h.customFields),
    items: input.lines.map(linePayload),
  };
}

/** What the form starts with from a saved Purchase Indent (the Purchase Order's, field for field). */
export function formFromPurchaseIndent(pr: PurchaseIndent, party: Party | null, duplicate: boolean) {
  return formFromPurchaseOrder({ ...pr, poNumber: pr.prNumber } as unknown as PurchaseOrder, party, duplicate);
}
