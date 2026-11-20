import { api, apiWithMessage } from '@/api/client';

/** One of the company's bank accounts: where money received goes and money paid comes from. */
export type BankAccount = {
  id: string;
  companyId: string;
  label: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  branch?: string | null;
  upiId?: string | null;
  isDefault: boolean;
  isActive: boolean;
};

/** An additional place of business under the GSTIN (a plant, warehouse or branch); its state is the company's. */
export type CompanyLocation = {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  pincode: string;
  contactPerson?: string | null;
  contactPhone?: string | null;
  isActive: boolean;
};

/** The company as it prints on documents (server: CompanyDetails). One company per account. */
export type Company = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gstin: string | null;
  lutNo: string | null;
  lutFiledDate: string | null;
  lutEndDate: string | null;
  logoUrl: string | null;
  logoHeight: number | null;
  isDefault: boolean;
  isActive: boolean;
  bankAccounts?: BankAccount[];
  locations?: CompanyLocation[];
};

/** What the Edit form sends. The GSTIN and state are fixed when the account is made and are never sent. */
export type CompanyInput = {
  name: string;
  address: string;
  city: string | null;
  pincode: string | null;
  lutNo: string | null;
  lutFiledDate: string | null;
  lutEndDate: string | null;
  logoUrl: string | null;
  logoHeight: number;
};

export type BankAccountInput = {
  label: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  branch: string | null;
  upiId: string | null;
  isDefault: boolean;
};

export type LocationInput = {
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  pincode: string;
  contactPerson: string;
  contactPhone: string;
};

/** The company, with its deactivated bank accounts and locations too (to reactivate them). */
export async function getCompany(): Promise<Company | null> {
  const list = await api<Company[]>('/company?bankAccounts=all&locations=all');
  return [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0] ?? null;
}

export const updateCompany = (id: string, body: CompanyInput) => api<Company>(`/company/${id}`, { method: 'PUT', body });

export const addBankAccount = (companyId: string, body: BankAccountInput) => apiWithMessage<BankAccount>(`/company/${companyId}/bank-accounts`, { method: 'POST', body });
export const updateBankAccount = (companyId: string, id: string, body: Partial<BankAccountInput>) =>
  apiWithMessage<BankAccount>(`/company/${companyId}/bank-accounts/${id}`, { method: 'PUT', body });
export const deactivateBankAccount = (companyId: string, id: string) => apiWithMessage<unknown>(`/company/${companyId}/bank-accounts/${id}`, { method: 'DELETE' });
export const reactivateBankAccount = (companyId: string, id: string) => apiWithMessage<unknown>(`/company/${companyId}/bank-accounts/${id}/reactivate`, { method: 'PATCH' });

export const addLocation = (companyId: string, body: LocationInput) => apiWithMessage<CompanyLocation>(`/company/${companyId}/locations`, { method: 'POST', body });
export const updateLocation = (companyId: string, id: string, body: Partial<LocationInput>) =>
  apiWithMessage<CompanyLocation>(`/company/${companyId}/locations/${id}`, { method: 'PUT', body });
export const deactivateLocation = (companyId: string, id: string) => apiWithMessage<unknown>(`/company/${companyId}/locations/${id}`, { method: 'DELETE' });
export const reactivateLocation = (companyId: string, id: string) => apiWithMessage<unknown>(`/company/${companyId}/locations/${id}/reactivate`, { method: 'PATCH' });

/** "Lock Approved & Cancelled Docs": one switch for every document; only an Admin changes it. */
export const getDocumentLock = async () => (await api<{ documentLock?: boolean }>('/config')).documentLock === true;
export const setDocumentLock = async (locked: boolean) => {
  const { data, message } = await apiWithMessage<{ documentLock?: boolean }>('/config/document-lock', { method: 'PATCH', body: { locked } });
  return { locked: data.documentLock === true, message };
};
