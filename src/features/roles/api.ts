import { api, apiWithMessage } from '@/api/client';

export type Permission = { id: string; resource: string; action: string; description?: string };

/** A role (server: Role with its permissions and how many users have it). */
export type Role = { id: string; name: string; description?: string | null; permissions: Permission[]; _count?: { users: number } };

/** One line of a role's History (who created it, who changed its permissions). */
export type RoleHistoryEntry = {
  id: string;
  action: string;
  createdAt: string;
  changedBy?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  newValues?: { summary?: string } | null;
};

export const listRoles = () => api<Role[]>('/roles');
/** Every permission that can be given (the Admin's "*:*" wildcard is in it; it is never offered as a tick). */
export const listPermissions = () => api<Permission[]>('/roles/permissions');
export const getRoleHistory = (id: string) => api<RoleHistoryEntry[]>(`/roles/${id}/history`);

export const createRole = (body: { name: string; description?: string }) => apiWithMessage<Role>('/roles', { method: 'POST', body });
export const saveRolePermissions = (id: string, permissionIds: string[]) =>
  apiWithMessage<Role>(`/roles/${id}/permissions`, { method: 'PUT', body: { permissionIds } });
