import { calculateWithTax } from 'floman-shared/priceConversion';
import { useRef } from 'react';
import { newLine, type FormLine } from '@/features/quotations/form';
import { takeHandoff, type Handoff, type PickedLine } from './handoff';

const shown = (value: number) => (value === 0 ? '' : String(Number(value.toFixed(2))));

/** A line picked in Manage Indents as a line of the new document (the web's `preloadedItems`), keeping its Indent shares. */
export function lineFromPicked(p: PickedLine): FormLine {
  const rate = Number(p.unitPrice) || 0;
  const taxRate = Number(p.taxRate) || 0;
  const scope = p.scopeOfWork || '';
  return {
    ...newLine(),
    partId: p.partId ?? null,
    partCode: p.partCode ?? null,
    partName: p.partName,
    hsn: p.hsn || '',
    scope,
    showSpecs: Boolean(scope),
    qty: shown(Number(p.qty) || 0),
    uom: p.uom,
    rate: shown(rate),
    rateWithTax: shown(calculateWithTax(rate, taxRate)),
    taxRate,
    indentRef: p.indentRef || null,
    indentAllocations: p.indentAllocations.map((a) => ({ indentItemId: a.indentItemId, allocatedQty: Number(a.allocatedQty) })),
  };
}

/** The lines the form was opened with from Manage Indents, taken once (none when it was opened any other way). */
export function useIndentHandoff(fromIndents: boolean): Handoff | null {
  const taken = useRef<Handoff | null | undefined>(undefined);
  if (taken.current === undefined) taken.current = fromIndents ? takeHandoff() : null;
  return taken.current;
}

/** "Made from Indents: IND-1, IND-2". */
export const madeFromIndents = (handoff: Handoff) => `Made from Indents: ${handoff.sourceIndentNumbers.join(', ')}`;
