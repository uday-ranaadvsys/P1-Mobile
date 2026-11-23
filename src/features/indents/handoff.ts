/**
 * The lines picked in Manage Indents, handed to the form that makes the document (a Purchase Indent, a Purchase or a
 * Direct Purchase Order). The web passes them in the page's state; on the phone they wait here until that form opens
 * and takes them (once).
 */
export type PickedLine = {
  partId?: string | null;
  partName: string;
  partCode?: string | null;
  partDescription?: string | null;
  hsn?: string | null;
  qty: number;
  uom: string;
  unitPrice: number;
  taxRate: number;
  scopeOfWork?: string | null;
  indentRef: string;
  indentAllocations: { indentItemId: string; allocatedQty: number; indentNumber: string }[];
};

export type Handoff = {
  lines: PickedLine[];
  sourceIndentNumbers: string[];
  /** Where the Indents are needed, when it is one place for all of them (the new document starts there). */
  neededAt: string | null;
};

let waiting: Handoff | null = null;

export const giveHandoff = (handoff: Handoff) => {
  waiting = handoff;
};

/** The picked lines, once; none when the form was not opened from Manage Indents. */
export const takeHandoff = (): Handoff | null => {
  const handoff = waiting;
  waiting = null;
  return handoff;
};
