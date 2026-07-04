import { redirect } from 'next/navigation';
import { getCurrentUserProfile } from '@/lib/auth/session';
import { isSuperAdminProfile } from '@/lib/auth/superAdmin';

export async function requireSuperAdmin() {
  const result = await getCurrentUserProfile();
  if (!result) redirect('/login');
  if (!isSuperAdminProfile(result.profile)) redirect('/dashboard');
  return result;
}

export async function redirectSuperAdminAwayFromCompanyApp() {
  const result = await getCurrentUserProfile();
  if (!result) redirect('/login');
  if (isSuperAdminProfile(result.profile)) redirect('/super-admin');
  return result;
}
