import { useQuery } from '@tanstack/react-query';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { listSeries } from './api';

/** The numbering series a new Quotation can take (a place's own series when Bill from is chosen). */
export const useQuotationSeries = (billingLocationId: string) =>
  useQuery({
    queryKey: ['series', DOCUMENT_TYPE.QUOTATION, billingLocationId],
    queryFn: () => listSeries(DOCUMENT_TYPE.QUOTATION, billingLocationId || null),
  });
