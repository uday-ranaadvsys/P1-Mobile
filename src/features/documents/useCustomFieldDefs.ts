import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS } from 'floman-shared/permissions';
import { useMemo } from 'react';
import { useSession } from '@/features/auth/session';
import { listCustomFields } from './api';

/**
 * The company's own fields for a kind of document (`documentType`: QUOTATION, PURCHASE_ORDER…), in their order. A
 * confidential field is only offered to someone who may see prices (the web's useCustomFields).
 */
export function useCustomFieldDefs(documentType: string) {
  const { can } = useSession();
  const query = useQuery({ queryKey: ['custom-fields', documentType], queryFn: () => listCustomFields(documentType) });
  const canSeeConfidential = can(PERMISSIONS.DOCUMENTS.VIEW_PRICING);
  const fields = useMemo(
    () => [...(query.data ?? [])].filter((f) => !f.isConfidential || canSeeConfidential).sort((a, b) => a.sortOrder - b.sortOrder),
    [query.data, canSeeConfidential],
  );
  return { fields, isLoading: query.isLoading };
}
