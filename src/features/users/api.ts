import { api, apiWithMessage } from '@/api/client';

export type UserRole = { id: string; name: string };
export type Department = { id: string; name: string; code: string };

/** A user of the company (server: User, without the password). */
export type AppUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNo: string;
  isActive: boolean;
  roles?: UserRole[];
  departmentId?: string | null;
  department?: Department | null;
  lastSignInAt?: string | null;
  createdAt?: string;
};

/** What the form sends (server: CreateUserSchema / UpdateUserSchema). A locked role is not sent. */
export type UserInput = {
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNo: string;
  roleIds?: string[];
  departmentId: string | null;
};

export const listUsers = () => api<AppUser[]>('/users');
/** The roles a user can be given (needs Roles: Read; a user without it sees the role but cannot change it). */
export const listRoles = () => api<UserRole[]>('/roles');
export const listDepartments = () => api<Department[]>('/departments?activeOnly=true');

export const createUser = (body: UserInput & { password: string }) => apiWithMessage<AppUser>('/users', { method: 'POST', body });
export const updateUser = (id: string, body: UserInput) => apiWithMessage<AppUser>(`/users/${id}`, { method: 'PUT', body });
/** Switches a user between active and inactive; answers the new state and the server's message. */
export const toggleUserStatus = (id: string) => apiWithMessage<{ isActive: boolean }>(`/users/${id}/status`, { method: 'PATCH' });
/** The admin types a temporary password; the user must replace it at the next sign-in. */
export const resetUserPassword = (id: string, password: string) => apiWithMessage<unknown>(`/users/${id}/reset-password`, { method: 'POST', body: { password } });
