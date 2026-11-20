import { isFullAccess, MATRIX_COLUMNS, PERMISSION_RESOURCE_GROUPS, PERMISSION_RESOURCE_NAMES } from 'floman-shared/permissions';
import type { Permission } from './api';

// The six columns and the full-access rule are shared with the web (floman-shared/permissions).
export { isFullAccess, MATRIX_COLUMNS };


/** The full-access wildcard belongs to the Admin role only; it is never offered as a box to tick. */
export const grantable = (permissions: Permission[]) => permissions.filter((p) => p.resource !== '*');

export type MatrixRow = { resource: string; screen: string; cells: { label: string; permission: Permission | null }[] };

/** Groups of rows (one per screen), one cell per column (none where the screen has no such permission). */
export function buildGroups(permissions: Permission[]): { name: string; rows: MatrixRow[] }[] {
  const resources = Array.from(new Set(permissions.map((p) => p.resource)));
  const listed = new Set(PERMISSION_RESOURCE_GROUPS.flatMap((g) => g.resources));
  const rowOf = (resource: string): MatrixRow => {
    const own = permissions.filter((p) => p.resource === resource);
    return {
      resource,
      screen: PERMISSION_RESOURCE_NAMES[resource] ?? resource,
      cells: MATRIX_COLUMNS.map((c) => ({ label: c.label, permission: own.find((p) => c.actions.includes(p.action)) ?? null })),
    };
  };
  return PERMISSION_RESOURCE_GROUPS.map((group, i) => {
    const names = group.resources.filter((r) => resources.includes(r));
    // Anything new and not yet grouped goes in the last group.
    if (i === PERMISSION_RESOURCE_GROUPS.length - 1) names.push(...resources.filter((r) => !listed.has(r)));
    return { name: group.name, rows: names.map(rowOf) };
  }).filter((g) => g.rows.length > 0);
}
