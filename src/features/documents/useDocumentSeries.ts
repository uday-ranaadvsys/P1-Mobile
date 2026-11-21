import { useQuery } from '@tanstack/react-query';
import { listSeries } from './api';

/** The numbering series a new document can take (a place's own series when Bill from / Bill to is chosen). */
export const useDocumentSeries = (documentType: string, billingLocationId: string) =>
  useQuery({
    queryKey: ['series', documentType, billingLocationId],
    queryFn: () => listSeries(documentType, billingLocationId || null),
  });
