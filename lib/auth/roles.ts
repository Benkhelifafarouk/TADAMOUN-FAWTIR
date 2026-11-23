export const ROLES = ['beneficiary', 'donor', 'support', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Highest-privilege first. Used to pick a landing page after login. */
const PRECEDENCE: Role[] = ['admin', 'support', 'beneficiary', 'donor'];

export function primaryRole(roles: readonly Role[]): Role {
  for (const role of PRECEDENCE) {
    if (roles.includes(role)) return role;
  }
  return 'donor';
}

export function homePathForRoles(roles: readonly Role[]): string {
  switch (primaryRole(roles)) {
    case 'admin':
    case 'support':
      return '/admin';
    case 'beneficiary':
      return '/app';
    default:
      return '/donor';
  }
}

export function hasRole(roles: readonly Role[], ...allowed: Role[]): boolean {
  return allowed.some((role) => roles.includes(role));
}

export function isAdmin(roles: readonly Role[]): boolean {
  return roles.includes('admin');
}
