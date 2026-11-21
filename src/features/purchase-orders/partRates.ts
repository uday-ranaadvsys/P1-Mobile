import { partTaxRate } from 'floman-shared/gst';
import { listParts } from '@/features/parts/api';
import { withTaxRate, type FormLine } from '@/features/quotations/form';

/**
 * Changing from a vendor with no GSTIN (lines at 0%) to one with a GSTIN puts each line back on its part's GST rate
 * (the web's handleSelectVendor). Fetches only the parts of the lines, then returns a function that applies their rates
 * to the lines as they are by then.
 */
export async function partRatesForLines(lines: FormLine[], fallbackRate: number): Promise<(current: FormLine[]) => FormLine[]> {
  const ids = [...new Set(lines.map((l) => l.partId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return (current) => current;
  const { rows } = await listParts(1, ids.length, { ids: ids.join(','), status: 'all' });
  const rateOf = new Map(rows.map((p) => [p.id, partTaxRate(p, fallbackRate)]));
  return (current) => current.map((l) => (l.partId && rateOf.has(l.partId) ? withTaxRate(l, rateOf.get(l.partId)!) : l));
}
