export type AdminRole = 'platform_admin' | 'operations_admin' | 'support_admin' | 'finance_admin' | 'content_admin';
export type AdminPermission =
  | 'dashboard' | 'companies' | 'users' | 'team' | 'tenders' | 'packages'
  | 'subscriptions' | 'usage' | 'analytics' | 'activity' | 'support' | 'settings';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  platform_admin: 'Platform Yöneticisi',
  operations_admin: 'Operasyon Yöneticisi',
  support_admin: 'Destek Yöneticisi',
  finance_admin: 'Finans Yöneticisi',
  content_admin: 'İçerik Yöneticisi'
};

const MATRIX: Record<AdminRole, AdminPermission[]> = {
  platform_admin: ['dashboard','companies','users','team','tenders','packages','subscriptions','usage','analytics','activity','support','settings'],
  operations_admin: ['dashboard','companies','users','tenders','analytics','activity'],
  support_admin: ['dashboard','users','activity','support'],
  finance_admin: ['dashboard','companies','packages','subscriptions','usage','analytics','activity'],
  content_admin: ['dashboard','tenders','activity']
};

export function normalizeAdminRole(value?: string | null): AdminRole | null {
  return Object.prototype.hasOwnProperty.call(MATRIX, value || '') ? value as AdminRole : null;
}

export function hasAdminPermission(role: string | null | undefined, permission: AdminPermission): boolean {
  const normalized = normalizeAdminRole(role);
  return normalized ? MATRIX[normalized].includes(permission) : false;
}
