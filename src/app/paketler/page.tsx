import Link from 'next/link';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { MarketingShell } from '@/components/marketing/MarketingShell';

const plans = [
  ['Başlangıç', 'İhaleye yeni başlayan ekipler için', ['Temel doküman analizi', 'Kritik tarih ve belge özeti', 'Tek kullanıcı', 'Standart destek']],
  ['Profesyonel', 'Düzenli ihale hazırlayan şirketler için', ['Gelişmiş doküman analizi', 'Şirket belge yönetimi', 'İhale Asistanı', 'Çoklu kullanıcı', 'Öncelikli destek']],
  ['Kurumsal', 'Yüksek hacimli ihale ekipleri için', ['Kuruma özel kullanım limiti', 'Rol ve yetki yönetimi', 'Gelişmiş raporlama', 'Özel onboarding', 'Kurumsal destek']]
] as const;

export default function Pricing({ searchParams }: { searchParams?: { reason?: string } }) {
  const limitReached = searchParams?.reason === 'free-limit';

  return (
    <MarketingShell>
      <section className="border-b border-stone-200 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-[1200px] px-5 py-16 lg:px-10 lg:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-600">Paketler</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 lg:text-6xl">
            İhale hacminize uygun çalışma modeli
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 lg:text-lg">
            Paketler şirketinizin kullanıcı, doküman ve analiz ihtiyacına göre yapılandırılır.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-[1200px] px-5 py-20 lg:px-10">
        {limitReached && (
          <div className="mb-8 rounded-[26px] border border-amber-200 bg-amber-50 p-6 text-amber-950">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 shrink-0 text-amber-700" size={20} />
              <div>
                <h2 className="text-lg font-semibold">Ücretsiz ihale hakkınızı kullandınız</h2>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Yeni ihale oluşturmak veya yeniden analiz çalıştırmak için şirketinize uygun paketi seçin.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map(([name, description, features], index) => (
            <div
              key={name}
              className={`rounded-[30px] border p-7 ${index === 1 ? 'border-brand-400 bg-brand-900 text-white shadow-modal' : 'border-stone-200 bg-white'}`}
            >
              <p className={`text-xs font-bold uppercase tracking-[0.2em] ${index === 1 ? 'text-sky-200' : 'text-brand-600'}`}>
                {index === 1 ? 'En çok tercih edilen' : 'Paket'}
              </p>
              <h2 className="mt-4 text-2xl font-semibold">{name}</h2>
              <p className={`mt-3 text-sm leading-6 ${index === 1 ? 'text-slate-300' : 'text-stone-500'}`}>{description}</p>
              <p className="mt-8 text-3xl font-semibold">Teklif alın</p>
              <div className="mt-7 space-y-4">
                {features.map((feature) => (
                  <div key={feature} className="flex gap-3 text-sm">
                    <Check size={17} className={index === 1 ? 'text-sky-300' : 'text-emerald-600'} />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/iletisim"
                className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold ${index === 1 ? 'bg-white text-brand-900' : 'bg-brand-900 text-white'}`}
              >
                Pakete Geçiş Talebi <ArrowRight size={15} />
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs leading-6 text-stone-500">
          Yeni hesaplara bir defaya mahsus 1 ücretsiz ihale ve 1 analiz hakkı tanımlanır.
        </p>
      </section>
    </MarketingShell>
  );
}
