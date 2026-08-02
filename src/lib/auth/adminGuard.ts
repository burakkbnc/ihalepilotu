import { redirect } from 'next/navigation';
import { getCurrentUserProfile } from '@/lib/auth/session';
import { isSuperAdminEmail, isSuperAdminProfile } from '@/lib/auth/superAdmin';
import { hasAdminPermission, type AdminPermission } from '@/lib/auth/adminPermissions';

export async function requireSuperAdmin() {
  const result = await getCurrentUserProfile();
  if (!result) redirect('/login');
  if (!isSuperAdminProfile(result.profile)) redirect('/dashboard');
  return result;
}

export async function requireAdminPermission(permission: AdminPermission) {
  const result = await requireSuperAdmin();
  // Yalnız SUPER_ADMIN_EMAILS içindeki ana hesaplar sınırsızdır.
  // Eski kayıtlarda role=super_admin olsa bile adminRole varsa yönetici ekibi izin matrisine tabidir.
  const isRootAdmin = isSuperAdminEmail(result.profile.email) || (result.profile.role === 'super_admin' && !result.profile.adminRole);
  if (!isRootAdmin && !hasAdminPermission(result.profile.adminRole, permission)) {
    redirect('/super-admin?error=forbidden');
  }
  return result;
}

export async function redirectSuperAdminAwayFromCompanyApp() {
  const result = await getCurrentUserProfile();
  if (!result) redirect('/login');
  if (isSuperAdminProfile(result.profile)) redirect('/super-admin');
  return result;
}
