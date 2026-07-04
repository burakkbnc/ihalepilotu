'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Crown,
  MailPlus,
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCog,
  Users,
  UserPlus
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { CompanyMember, UserRole } from '@/types';

type CompanyUserRole = Exclude<UserRole, 'super_admin'>;

const ROLE_LABELS: Record<CompanyUserRole, string> = {
  owner: 'Şirket Sahibi',
  admin: 'Yönetici',
  member: 'Üye'
};

const ROLE_DESCRIPTIONS: Record<CompanyUserRole, string> = {
  owner: 'Şirket, ekip ve kritik ayarların tam yetkili kullanıcısı.',
  admin: 'İhale dosyası oluşturabilir, analizleri yönetebilir ve içerikleri güncelleyebilir.',
  member: 'İhale dosyalarını ve analiz sonuçlarını görüntüleyebilir.'
};

function getInitials(name?: string) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export default function CompanyUsersPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CompanyUserRole>('member');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && profile && profile.role !== 'owner') {
      router.replace('/dashboard');
    }
  }, [authLoading, profile, router]);

  const loadMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/company/members');
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Üyeler yüklenemedi.');
      setMembers(body.data.members as CompanyMember[]);
    } catch (err: any) {
      setError(err?.message || 'Üyeler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, []);

  const stats = useMemo(() => {
    const active = members.filter((member) => member.status === 'active').length;
    const owners = members.filter((member) => member.role === 'owner').length;
    const admins = members.filter((member) => member.role === 'admin').length;
    const regularMembers = members.filter((member) => member.role === 'member').length;
    return { active, owners, admins, regularMembers };
  }, [members]);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setActionMessage(null);
    setInviteSubmitting(true);

    try {
      const res = await fetch('/api/company/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Kullanıcı eklenemedi.');

      setInviteEmail('');
      setInviteRole('member');
      setActionMessage('Kullanıcı şirkete eklendi.');
      await loadMembers();
    } catch (err: any) {
      setInviteError(err?.message || 'Kullanıcı eklenemedi.');
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleRoleChange = async (uid: string, role: CompanyUserRole) => {
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/company/members/${uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Rol güncellenemedi.');
      setActionMessage('Kullanıcı rolü güncellendi.');
      await loadMembers();
    } catch (err: any) {
      setError(err?.message || 'Rol güncellenemedi.');
    }
  };

  const handleRemove = async (uid: string) => {
    if (!confirm('Bu kullanıcıyı şirketten çıkarmak istediğinize emin misiniz?')) return;
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/company/members/${uid}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Kullanıcı çıkarılamadı.');
      setActionMessage('Kullanıcı şirketten çıkarıldı.');
      await loadMembers();
    } catch (err: any) {
      setError(err?.message || 'Kullanıcı çıkarılamadı.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6">
      <header className="overflow-hidden rounded-[34px] border border-white/10 bg-[#050A18] text-white shadow-[0_28px_90px_rgba(15,23,42,0.20)]">
        <div className="relative p-7 lg:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_18%,rgba(96,165,250,0.24),transparent_30%),radial-gradient(circle_at_22%_100%,rgba(14,165,233,0.22),transparent_35%),linear-gradient(135deg,#050A18_0%,#081832_52%,#050A18_100%)]" />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-[42%] opacity-35 [background-image:radial-gradient(circle_at_center,rgba(96,165,250,0.36)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="pointer-events-none absolute -right-20 top-12 h-80 w-80 rounded-full border border-sky-400/10" />

          <div className="relative grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <Building2 size={14} />
                Şirket Paneli
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.055em] text-white lg:text-6xl">
                Ekibinizi ve erişim rollerini tek kokpitten yönetin
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 lg:text-lg">
                İhale süreçlerinde kimlerin dosya oluşturabileceğini, analizleri yönetebileceğini ve sonuçları görüntüleyebileceğini buradan kontrol edin.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <HeroMetric icon={<Users size={22} />} label="Toplam kullanıcı" value={String(members.length)} helper="Şirket hesabı" />
              <HeroMetric icon={<CheckCircle2 size={22} />} label="Aktif kullanıcı" value={String(stats.active)} helper="Erişimi açık" />
              <HeroMetric icon={<Crown size={22} />} label="Owner" value={String(stats.owners)} helper="Tam yetkili" />
              <HeroMetric icon={<ShieldCheck size={22} />} label="Yönetici" value={String(stats.admins)} helper="Operasyon yetkisi" />
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <aside className="space-y-6">
          <div className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Kullanıcı ekle</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Yeni ekip üyesi</h2>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                <UserPlus size={22} />
              </div>
            </div>

            <form onSubmit={handleInvite} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">E-posta adresi</label>
                <div className="relative">
                  <MailPlus className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="kullanici@firma.com"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-10 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Rol</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as CompanyUserRole)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                >
                  <option value="admin">Yönetici</option>
                  <option value="member">Üye</option>
                </select>
                <p className="mt-2 text-xs leading-5 text-slate-500">{ROLE_DESCRIPTIONS[inviteRole]}</p>
              </div>

              <button
                type="submit"
                disabled={inviteSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {inviteSubmitting ? 'Ekleniyor…' : 'Kullanıcıyı ekle'}
                {!inviteSubmitting && <ArrowRight size={16} />}
              </button>
            </form>

            {inviteError && <AlertBox tone="danger" message={inviteError} />}
            {actionMessage && <AlertBox tone="success" message={actionMessage} />}

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
              Eklenecek kullanıcının önce <strong>Kayıt Ol</strong> sayfasından hesap oluşturmuş olması gerekir.
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Yetki haritası</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Rol dağılımı</h2>
            <div className="mt-5 space-y-3">
              <RoleSummary label="Şirket Sahibi" count={stats.owners} total={members.length} icon={<Crown size={17} />} />
              <RoleSummary label="Yönetici" count={stats.admins} total={members.length} icon={<ShieldCheck size={17} />} />
              <RoleSummary label="Üye" count={stats.regularMembers} total={members.length} icon={<Users size={17} />} />
            </div>
          </div>
        </aside>

        <section className="rounded-[30px] border border-slate-200/80 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Ekip listesi</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Şirket kullanıcıları</h2>
              <p className="mt-2 text-sm text-slate-500">Rolleri güncelleyin, pasif kullanıcıları temizleyin ve erişim kontrolünü sade tutun.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              <Sparkles size={16} className="text-blue-700" />
              {members.length} kullanıcı
            </div>
          </div>

          {error && <div className="px-6"><AlertBox tone="danger" message={error} /></div>}

          {loading ? (
            <div className="grid min-h-[360px] place-items-center p-8 text-sm font-medium text-slate-500">Yükleniyor…</div>
          ) : members.length === 0 ? (
            <div className="grid min-h-[360px] place-items-center p-8 text-center">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                  <Users size={24} />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-950">Henüz ekip üyesi yok</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Sol taraftaki formdan şirket kullanıcısı ekleyebilirsiniz.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    <th className="px-6 py-4">Kullanıcı</th>
                    <th className="px-6 py-4">Rol</th>
                    <th className="px-6 py-4">Durum</th>
                    <th className="px-6 py-4">Katılım</th>
                    <th className="px-6 py-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.uid} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-sm font-bold text-white shadow-sm">
                            {getInitials(member.displayName)}
                          </span>
                          <div className="min-w-0">
                            <p className="line-clamp-1 font-semibold text-slate-950">{member.displayName || 'İsimsiz kullanıcı'}</p>
                            <p className="line-clamp-1 text-xs text-slate-500">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {member.role === 'owner' ? (
                          <RolePill role="owner" />
                        ) : (
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.uid, e.target.value as CompanyUserRole)}
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                          >
                            <option value="admin">{ROLE_LABELS.admin}</option>
                            <option value="member">{ROLE_LABELS.member}</option>
                          </select>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {member.status === 'active' ? 'Aktif' : 'Devre dışı'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(member.joinedAt)}</td>
                      <td className="px-6 py-4 text-right">
                        {member.role !== 'owner' ? (
                          <button
                            onClick={() => handleRemove(member.uid)}
                            className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50"
                          >
                            <Trash2 size={15} />
                            Çıkar
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-bold text-slate-400">
                            <MoreHorizontal size={15} />
                            Kilitli
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function HeroMetric({ icon, label, value, helper }: { icon: ReactNode; label: string; value: string; helper: string }) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-white/[0.075] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-3 text-4xl font-semibold tracking-tight text-white">{value}</p>
          <p className="mt-1 text-sm text-slate-400">{helper}</p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-400/15 text-sky-200">{icon}</div>
      </div>
    </div>
  );
}

function RoleSummary({ label, count, total, icon }: { label: string; count: number; total: number; icon: ReactNode }) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-blue-700 shadow-sm ring-1 ring-slate-200">{icon}</span>
          <div>
            <p className="text-sm font-bold text-slate-900">{label}</p>
            <p className="text-xs text-slate-500">{count} kullanıcı</p>
          </div>
        </div>
        <span className="text-sm font-bold text-slate-700">%{percentage}</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-blue-600" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function RolePill({ role }: { role: CompanyUserRole }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
      {role === 'owner' ? <Crown size={14} /> : <UserCog size={14} />}
      {ROLE_LABELS[role]}
    </span>
  );
}

function AlertBox({ tone, message }: { tone: 'success' | 'danger'; message: string }) {
  const success = tone === 'success';
  return (
    <div className={`mt-4 flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-medium ${success ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'border border-red-200 bg-red-50 text-red-700'}`}>
      {success ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
      <span>{message}</span>
    </div>
  );
}
