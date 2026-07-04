import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Sidebar from '@/components/dashboard/Sidebar';
import { getCurrentUserProfile } from '@/lib/auth/session';
import type { UserRole } from '@/types';
import { isSuperAdminProfile } from '@/lib/auth/superAdmin';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const result = await getCurrentUserProfile();
  if (!result) redirect('/login');

  const { profile } = result;
  const isSuperAdmin = isSuperAdminProfile(profile);
  const pathname = headers().get('x-pathname') || '';

  if (isSuperAdmin && pathname && !pathname.startsWith('/super-admin')) redirect('/super-admin');

  if (!isSuperAdmin && (!profile.companyId || !profile.role)) redirect('/company/new');

  const sidebarRole = (profile.role === 'super_admin' ? 'super_admin' : profile.role || 'member') as UserRole;

  return (
    <div className="min-h-screen bg-[#F5F7FB] text-slate-950">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(37,99,235,0.10),transparent_34%),radial-gradient(circle_at_100%_0%,rgba(96,165,250,0.12),transparent_28%)]" />
      <div className="relative flex min-h-screen">
        <Sidebar role={sidebarRole} displayName={profile.displayName} email={profile.email} isSuperAdmin={isSuperAdmin} />
        <main className="min-w-0 flex-1 px-5 py-5 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
