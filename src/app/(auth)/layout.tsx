import type { ReactNode } from 'react';
import { AlertTriangle, CalendarDays, FileText, ShieldCheck } from 'lucide-react';

function ProductMockup() {
  return (
    <div className="relative mt-8 w-full max-w-[720px]">
      <div className="absolute -left-8 -top-8 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="absolute -bottom-10 -right-8 h-44 w-44 rounded-full bg-brand-500/20 blur-3xl" />

      <div className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-white/[0.08] p-3 shadow-2xl shadow-black/35 backdrop-blur-xl">
        <div className="rounded-[1.5rem] border border-white/10 bg-[#0B1220]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Canlı panel önizlemesi</p>
              <p className="mt-1 text-lg font-semibold text-white">Kamu İhalesi Hazırlık Merkezi</p>
            </div>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100">
              Analiz tamamlandı
            </span>
          </div>

          <div className="grid gap-4 p-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-100">
                    <FileText size={19} aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Şartnameden çıkarılan kritik başlıklar</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Teminat, iş deneyimi, son tarihler ve belge yükümlülükleri tek ekranda.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <p className="text-2xl font-semibold text-white">%3</p>
                  <p className="mt-1 text-xs text-slate-400">Geçici teminat</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <p className="text-2xl font-semibold text-white">9</p>
                  <p className="mt-1 text-xs text-slate-400">Gerekli belge</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <p className="text-2xl font-semibold text-white">12</p>
                  <p className="mt-1 text-xs text-slate-400">Kritik tarih</p>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                <div className="flex items-center gap-2 text-amber-100">
                  <AlertTriangle size={17} aria-hidden />
                  <p className="text-sm font-semibold">Yüksek öncelikli uyarı</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-amber-50/75">Geçici teminat ve iş deneyimi belgesi teklif öncesi kontrol listesine alınmalı.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Hazırlık akışı</p>
                <CalendarDays size={17} className="text-slate-400" aria-hidden />
              </div>
              <div className="mt-5 space-y-4">
                {[
                  ['Doküman analizi', 'Tamamlandı'],
                  ['Teminat kontrolü', 'Devam ediyor'],
                  ['Teklif hazırlığı', 'Sırada'],
                ].map(([title, state], index) => (
                  <div key={title} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/10 text-xs font-semibold text-white">
                        {index + 1}
                      </div>
                      {index < 2 && <div className="h-9 w-px bg-white/10" />}
                    </div>
                    <div className="pb-2">
                      <p className="text-sm font-medium text-white">{title}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{state}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-xs leading-5 text-emerald-50/80">
                <ShieldCheck size={16} className="mb-2" aria-hidden />
                Şirket bazlı güvenli veri alanı ve kapalı beta erişimi.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050B14] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(59,130,246,0.28),transparent_32%),radial-gradient(circle_at_82%_15%,rgba(20,184,166,0.16),transparent_30%),linear-gradient(135deg,#050B14_0%,#08111F_48%,#0D1728_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1440px] grid-cols-1 gap-10 px-5 py-6 lg:grid-cols-[0.94fr_1.06fr] lg:items-center lg:px-12">
        <section className="hidden lg:flex lg:min-h-[720px] lg:flex-col lg:justify-center">
          <img src="/brand/logo-white-clean.png" alt="İhale Pilotu" className="h-auto w-[250px] max-w-full" />

          <div className="mt-8 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-100/70">Akıllı ihale analiz platformu</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-[-0.055em] text-white xl:text-[58px]">
              Şartnameyi oku, riski gör, teklife hazır ol.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
              Kamu ihalelerinde kritik şartları, teminatları ve aksiyonları sade bir hazırlık paneline dönüştürür.
            </p>
          </div>

          <ProductMockup />
        </section>

        <section className="flex min-h-screen items-center justify-center py-8 lg:min-h-0 lg:justify-end lg:py-0">
          <div className="w-full max-w-[540px]">
            <div className="mb-8 flex justify-center lg:hidden">
              <img src="/brand/logo-white-clean.png" alt="İhale Pilotu" className="h-auto w-[290px] max-w-full" />
            </div>

            <div className="rounded-[2.25rem] border border-white/10 bg-white p-7 text-slate-950 shadow-2xl shadow-black/35 sm:p-10">
              {children}
            </div>

            <p className="mt-6 text-center text-xs text-slate-400">Kapalı beta · Şirket bazlı güvenli erişim</p>
          </div>
        </section>
      </div>
    </main>
  );
}
