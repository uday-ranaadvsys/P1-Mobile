import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from 'floman-shared/permissions';
import { useSession } from '@/features/auth/session';
import { notify } from '@/lib/notify';
import { toggleUserStatus, type AppUser } from './api';
import { ADMIN_ROLE, displayName } from './text';

/**
 * Who may do what with users, as the web's Users screen decides it (the server enforces the same): only an Admin invites
 * users, assigns roles or touches an Admin's account; nothing changes in a read-only session; the plan's seat limit caps
 * invitations (active users only).
 */
export function useUserAccess() {
  const { user: me, workspace, can } = useSession();
  const isAdmin = Boolean(me?.roles.includes(ADMIN_ROLE));
  const readOnly = Boolean(workspace?.readOnly);
  const seatLimit = workspace?.maxUsers ?? null;
  const activeSeats = workspace?.activeUsers ?? 0;
  const atSeatLimit = seatLimit !== null && activeSeats >= seatLimit;
  const canInvite = isAdmin && can(PERMISSIONS.USERS.CREATE) && !atSeatLimit && !readOnly;
  return {
    meId: me?.id,
    isAdmin,
    readOnly,
    seatLimit,
    activeSeats,
    atSeatLimit,
    canInvite,
    /** May change this user's account at all (an Admin's account only by an Admin). */
    canManage: (user: AppUser) => !readOnly && (isAdmin || !user.roles?.some((r) => r.name === ADMIN_ROLE)),
  };
}

/** Activate or deactivate a user (not your own account). Refreshes the lists and the seat count. */
export function useToggleUser(onError?: (message: string) => void) {
  const queryClient = useQueryClient();
  const { refresh } = useSession();
  const mutation = useMutation({
    mutationFn: (user: AppUser) => toggleUserStatus(user.id),
    onSuccess: ({ data, message }, user) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void refresh(); // the active-user count changed
      notify(message ?? `${displayName(user)} is now ${data.isActive ? 'active' : 'inactive'}.`);
    },
    onError: (e) => onError?.(e instanceof Error ? e.message : String(e)),
  });
  return { toggle: (user: AppUser) => mutation.mutate(user), busy: mutation.isPending };
}
