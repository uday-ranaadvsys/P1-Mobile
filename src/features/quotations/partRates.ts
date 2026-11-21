import { listParts } from '@/features/parts/api';
import { partTaxRate } from 'floman-shared/gst';
import { withTaxRate, type FormLine } from './form';

/**
 * When a document stops being SEZ with LUT, its lines at 0% take their GST rate back from the Part Master (every line
 * has a part). Lines with another rate stay as they are; a part whose own rate is 0% stays 0%. Fetches only the parts
 * of the lines at 0%, then returns a function that applies their rates to the lines as they are by then
 * (the web's utils/partRates.ts).
 */
export async function partRatesForZeroLines(lines: FormLine[]): Promise<(current: FormLine[]) => FormLine[]> {
  const ids = [...new Set(lines.filter((l) => l.taxRate === 0 && l.partId).map((l) => l.partId as string))];
  if (ids.length === 0) return (current) => current;
  const { rows } = await listParts(1, ids.length, { ids: ids.join(','), status: 'all' });
  const rateOf = new Map(rows.map((p) => [p.id, partTaxRate(p, 0)]));
  return (current) =>
    current.map((l) => {
      const rate = l.partId ? rateOf.get(l.partId) : undefined;
      return l.taxRate === 0 && rate ? withTaxRate(l, rate) : l;
    });
}
