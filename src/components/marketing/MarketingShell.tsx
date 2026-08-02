'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import Logo from '@/components/ui/Logo';

const nav = [
  ['Ürün', '/urun'],
  ['Nasıl Çalışır?', '/#nasil-calisir'],
  ['Paketler', '/paketler'],
  ['Hakkımızda', '/hakkimizda'],
  ['İletişim', '/iletisim']
] as const;

export function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/70 bg-white/88 backdrop-blur-2xl">
      <div className="mx-auto flex h-[78px] max-w-[1440px] items-center justify-between px-5 lg:px-10">
        <Link href="/" aria-label="İhale Pilotu ana sayfa" onClick={() => setOpen(false)}>
          <Logo size="lg" />
        </Link>
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Ana navigasyon">
          {nav.map(([label, href]) => (
            <Link key={href} href={href} className="text-sm font-medium text-stone-600 transition hover:text-brand-600">
              {label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          <Link href="/login" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100">Giriş Yap</Link>
          <Link href="/iletisim" className="inline-flex items-center gap-2 rounded-xl bg-brand-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-800">
            Demo Talep Et <ArrowRight size={15} />
          </Link>
        </div>
        <button onClick={() => setOpen(!open)} className="inline-flex rounded-xl border border-stone-200 bg-white p-3 text-stone-800 sm:hidden" aria-label="Menüyü aç" aria-expanded={open}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <div className="border-t border-stone-200 bg-white px-5 py-5 sm:hidden">
          <nav className="space-y-1" aria-label="Mobil navigasyon">
            {nav.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50">{label}</Link>)}
          </nav>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-stone-100 pt-4">
            <Link href="/login" className="rounded-xl border border-stone-200 px-4 py-3 text-center text-sm font-semibold">Giriş Yap</Link>
            <Link href="/iletisim" className="rounded-xl bg-brand-900 px-4 py-3 text-center text-sm font-semibold text-white">Demo Talep Et</Link>
          </div>
        </div>
      )}
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-16 md:grid-cols-2 lg:grid-cols-[1.4fr_0.7fr_0.7fr_0.8fr] lg:px-10">
        <div>
          <Logo size="lg" />
          <p className="mt-5 max-w-sm text-sm leading-7 text-stone-500">İhale dokümanlarını anlaşılır, izlenebilir ve ekipçe yönetilebilir bir çalışma alanına dönüştüren akıllı ihale analiz platformu.</p>
          
        </div>
        <FooterColumn title="Ürün" links={[["Özellikler", "/urun"], ["Nasıl Çalışır?", "/#nasil-calisir"], ["Paketler", "/paketler"]]} />
        <FooterColumn title="Şirket" links={[["Hakkımızda", "/hakkimizda"], ["İletişim", "/iletisim"], ["Demo Talep Et", "/iletisim"]]} />
        <FooterColumn title="Yasal" links={[["KVKK", "/kvkk"], ["Gizlilik Politikası", "/gizlilik-politikasi"], ["Kullanım Koşulları", "/kullanim-kosullari"], ["Çerez Politikası", "/cerez-politikasi"]]} />
      </div>
      <div className="border-t border-stone-100"><div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-5 py-5 text-xs text-stone-400 sm:flex-row sm:items-center sm:justify-between lg:px-10"><span>© {new Date().getFullYear()} İhale Pilotu. Tüm hakları saklıdır.</span><span>Akıllı ihale analiz platformu.</span></div></div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: readonly (readonly [string, string])[] }) {
  return <div><p className="text-sm font-bold text-stone-950">{title}</p><div className="mt-4 space-y-3">{links.map(([label, href]) => <Link key={href + label} className="block text-sm text-stone-500 transition hover:text-brand-600" href={href}>{label}</Link>)}</div></div>;
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-stone-50"><MarketingHeader /><main>{children}</main><MarketingFooter /></div>;
}

export function PageHero({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <section className="border-b border-stone-200 bg-white"><div className="mx-auto max-w-[1200px] px-5 py-20 text-center lg:px-10 lg:py-28"><p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-600">{eyebrow}</p><h1 className="mx-auto mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.055em] text-stone-950 sm:text-6xl">{title}</h1><p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-stone-600 sm:text-lg">{description}</p></div></section>;
}
