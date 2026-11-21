import { useQuery } from '@tanstack/react-query';
import { DOCUMENT_TYPE } from 'floman-shared/documentTypes';
import { PERMISSIONS } from 'floman-shared/permissions';
import { useMemo } from 'react';
import { useSession } from '@/features/auth/session';
import { listCustomFields } from './api';

/**
 * The company's own fields for a Quotation, in their order. A confidential field is only offered to someone who may
 * see prices (the web's useCustomFields).
 */
export function useCustomFieldDefs() {
  const { can } = useSession();
  const query = useQuery({ queryKey: ['custom-fields', DOCUMENT_TYPE.QUOTATION], queryFn: () => listCustomFields(DOCUMENT_TYPE.QUOTATION) });
  const canSeeConfidential = can(PERMISSIONS.DOCUMENTS.VIEW_PRICING);
  const fields = useMemo(
    () => [...(query.data ?? [])].filter((f) => !f.isConfidential || canSeeConfidential).sort((a, b) => a.sortOrder - b.sortOrder),
    [query.data, canSeeConfidential],
  );
  return { fields, isLoading: query.isLoading };
}
