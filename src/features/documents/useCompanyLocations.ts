import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getCompany } from '@/features/company/api';

/** The company's active locations (additional places of business): a document's "Bill from" / "Bill to" lists them. */
export function useCompanyLocations() {
  const company = useQuery({ queryKey: ['company'], queryFn: getCompany });
  return useMemo(() => (company.data?.locations ?? []).filter((l) => l.isActive), [company.data]);
}
