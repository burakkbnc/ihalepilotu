'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, FileText, Users, LogOut, Radar, UploadCloud, ShieldCheck, BarChart3, CalendarDays, Settings, LibraryBig, Building2, Package, LifeBuoy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types';

interface NavItem {
  href: string;
  label: string;
  roles: UserRole[];
  icon: typeof LayoutGrid;
  exact?: boolean;
  disabled?: boolean;
}


const SUPER_ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/super-admin', label: 'Admin Merkezi', roles: ['super_admin'], icon: ShieldCheck, exact: true },
  { href: '/super-admin/companies', label: 'Şirketler', roles: ['super_admin'], icon: Building2 },
  { href: '/super-admin/users', label: 'Kullanıcılar', roles: ['super_admin'], icon: Users },
  { href: '/super-admin/packages', label: 'Paketler', roles: ['super_admin'], icon: Package },
  { href: '/super-admin/usage', label: 'Kullanım / AI Maliyeti', roles: ['super_admin'], icon: BarChart3 },
  { href: '/super-admin/support', label: 'Destek / Hata', roles: ['super_admin'], icon: LifeBuoy }
];

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Komuta Merkezi', roles: ['owner', 'admin', 'member'], icon: LayoutGrid, exact: true },
  { href: '/tenders', label: 'İhale Dosyaları', roles: ['owner', 'admin', 'member'], icon: FileText },
  { href: '/tenders', label: 'Analizler', roles: ['owner', 'admin', 'member'], icon: BarChart3, disabled: true },
  { href: '/calendar', label: 'Takvim', roles: ['owner', 'admin', 'member'], icon: CalendarDays },
  { href: '/company/memory', label: 'Şirket Hafızası', roles: ['owner', 'admin'], icon: LibraryBig },
  { href: '/company/users', label: 'Şirket Paneli', roles: ['owner'], icon: Users },
  { href: '/dashboard', label: 'Ayarlar', roles: ['owner', 'admin'], icon: Settings, disabled: true }
];

export default function Sidebar({ role, displayName, email, isSuperAdmin = false }: { role: UserRole; displayName: string; email?: string; isSuperAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();

  const visibleItems = isSuperAdmin
    ? SUPER_ADMIN_NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.roles.includes(role));

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const roleLabel: Record<string, string> = {
    super_admin: 'Super Admin',
    owner: 'Şirket Sahibi',
    admin: 'Yönetici',
    member: 'Üye'
  };

  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="sticky top-0 hidden h-screen w-[300px] shrink-0 overflow-hidden lg:block">
      <div className="relative flex h-full flex-col overflow-y-auto border-r border-white/10 bg-[#050A18] px-5 py-6 text-white shadow-[18px_0_60px_rgba(2,6,23,0.30)] [scrollbar-width:thin] [scrollbar-color:rgba(56,189,248,.35)_transparent]">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-[radial-gradient(circle_at_50%_100%,rgba(37,99,235,0.26),transparent_62%)]" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full border border-sky-400/10" />

        <Link href={isSuperAdmin ? '/super-admin' : '/dashboard'} className="relative flex items-center px-1 py-2">
          <Image
            src="/brand/logo-white.png"
            alt="İhale Pilotu"
            width={240}
            height={100}
            priority
            className="h-auto w-[210px] object-contain"
          />
        </Link>

        <div className="relative mt-7 rounded-[22px] border border-white/10 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-sky-300">
            <Radar size={14} />
            {isSuperAdmin ? 'Platform Admin' : 'İhale Pilotu'}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{isSuperAdmin ? 'Şirketleri, paketleri, kullanıcıları ve sistem kullanımını yönetin.' : 'Şartname, teminat, risk ve kritik tarihleri tek kokpitte takip et.'}</p>
        </div>

        <nav className="relative mt-6 flex-1 space-y-1.5 pb-4">
          {visibleItems.map((item, index) => {
            const active = !item.disabled && (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/'));
            const Icon = item.icon;
            const content = (
              <>
                <span className={cn('grid h-9 w-9 place-items-center rounded-2xl transition', active ? 'bg-sky-400/20 text-sky-200' : 'bg-white/[0.07] text-slate-300 group-hover:bg-white/10 group-hover:text-white')}>
                  <Icon size={17} strokeWidth={2.2} aria-hidden />
                </span>
                <span>{item.label}</span>
              </>
            );

            if (item.disabled) {
              return (
                <div
                  key={`${item.label}-${index}`}
                  className="group flex cursor-not-allowed items-center gap-3 rounded-[18px] border border-transparent px-3.5 py-3 text-sm font-semibold text-slate-500"
                  title="Yakında"
                >
                  {content}
                </div>
              );
            }

            return (
              <Link
                key={`${item.label}-${index}`}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-[18px] px-3.5 py-3 text-sm font-semibold transition duration-200',
                  active
                    ? 'border border-sky-400/30 bg-sky-400/[0.12] text-sky-100 shadow-[0_10px_30px_rgba(56,189,248,0.10)]'
                    : 'border border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.06] hover:text-white'
                )}
              >
                {content}
              </Link>
            );
          })}
        </nav>

        {!isSuperAdmin && (
          <div className="relative rounded-[22px] border border-sky-400/[0.18] bg-sky-400/[0.07] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-sky-200">
              <UploadCloud size={16} />
              Yeni akış
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">İdari + teknik şartname yükleyin, analiz hattını başlatın.</p>
            <Link
              href="/tenders/new"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-400/30 px-3 py-2.5 text-sm font-semibold text-sky-200 transition hover:bg-sky-400 hover:text-slate-950"
            >
              Yeni İhale Başlat
            </Link>
          </div>
        )}

        <div className="relative mt-4 border-t border-white/10 pt-4">
          <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.055] p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-slate-950">
              {initials || <ShieldCheck size={18} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-semibold leading-snug text-white">{displayName}</p>
              <p className="line-clamp-1 text-xs text-slate-400">{email || roleLabel[role]}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-sky-300">{roleLabel[role]} · Oturum açık</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="mt-2 flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut size={16} strokeWidth={2} aria-hidden />
            Çıkış Yap
          </button>
        </div>
      </div>
    </aside>
  );
}
