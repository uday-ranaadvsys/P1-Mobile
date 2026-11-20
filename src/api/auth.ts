import { api } from './client';

export type SessionUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNo: string;
  tenantId: string;
  roles: string[];
  permissions: string[]; // "Resource:ACTION"
  mustChangePassword: boolean;
};
export type Workspace = { status: string; readOnly: boolean };
export type Company = { workspace: string; name: string };

export type LoginResult =
  | { token: string; expiresAt: string; user: SessionUser; workspace: Workspace }
  | { chooseCompany: Company[] };

export const login = (identifier: string, password: string, workspace?: string) =>
  api<LoginResult>('/auth/login', { method: 'POST', body: { identifier, password, workspace }, login: true });

export const me = () => api<{ user: SessionUser; workspace: Workspace }>('/auth/me');
export const logout = () => api<unknown>('/auth/logout', { method: 'POST' });
export const changePassword = (currentPassword: string, newPassword: string) =>
  api<unknown>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
