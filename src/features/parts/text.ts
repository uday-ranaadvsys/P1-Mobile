import { PART_TYPE } from 'floman-shared/constants';
import { formatQty } from '@/lib/format';
import type { Part } from './api';

/** What the two kinds of part are called on screen (web: TYPE_WORD). */
export const PART_TYPE_LABEL: Record<string, string> = {
  [PART_TYPE.PRODUCT]: 'Product',
  [PART_TYPE.SERVICE]: 'Service',
};

/** A service has no stock and takes a SAC code; a product has stock and takes an HSN code. */
export const isProduct = (part: Pick<Part, 'partType'>) => part.partType !== PART_TYPE.SERVICE;

/** Stock below the part's own minimum (none set: never low). */
export const isLow = (part: Pick<Part, 'inStock' | 'minStock'>) =>
  part.minStock !== null && part.minStock !== undefined && Number(part.inStock ?? 0) < Number(part.minStock);

/** "12 kg" (a whole number without decimals). */
export const qtyText = (value: unknown, unit: string) => `${formatQty(Number(value ?? 0))} ${unit}`;

export const gstRate = (part: Pick<Part, 'taxRate' | 'defaultTax'>) => Number(part.taxRate?.percentage ?? part.defaultTax);

/** The group names of a part, or a dash. */
export const groupText = (part: Pick<Part, 'classifications'>) => part.classifications?.map((c) => c.name).join(', ') || '—';
