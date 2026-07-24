'use client';
import { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export default function ContactForm() {
  const [sent, setSent] = useState(false);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const subject = encodeURIComponent(`İhale Pilotu Demo Talebi - ${fd.get('company') || fd.get('name')}`);
    const body = encodeURIComponent(`Ad Soyad: ${fd.get('name')}\nŞirket: ${fd.get('company')}\nE-posta: ${fd.get('email')}\nTelefon: ${fd.get('phone')}\nAylık ihale sayısı: ${fd.get('volume')}\n\nMesaj:\n${fd.get('message')}`);
    window.location.href = `mailto:info@ihalepilotu.com?subject=${subject}&body=${body}`;
    setSent(true);
  }
  if (sent) return <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-8 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={36}/><h2 className="mt-4 text-xl font-semibold text-stone-950">E-posta uygulamanız açıldı</h2><p className="mt-2 text-sm leading-6 text-stone-600">Bilgileri kontrol edip e-postayı göndererek demo talebinizi tamamlayabilirsiniz.</p></div>;
  return <form onSubmit={submit} className="rounded-[30px] border border-stone-200 bg-white p-6 shadow-card sm:p-8"><div className="grid gap-5 sm:grid-cols-2">{[['name','Ad soyad','text'],['company','Şirket','text'],['email','Kurumsal e-posta','email'],['phone','Telefon','tel']].map(([name,label,type])=><label key={name} className="text-sm font-semibold text-stone-700">{label}<input required name={name} type={type} className="mt-2 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 font-normal outline-none transition focus:border-brand-400 focus:bg-white" /></label>)}<label className="text-sm font-semibold text-stone-700 sm:col-span-2">Aylık yaklaşık ihale sayısı<select name="volume" className="mt-2 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 font-normal"><option>1-5</option><option>6-15</option><option>16-30</option><option>30+</option></select></label><label className="text-sm font-semibold text-stone-700 sm:col-span-2">Mesaj<textarea name="message" rows={4} className="mt-2 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 font-normal" /></label></div><label className="mt-5 flex items-start gap-3 text-xs leading-5 text-stone-500"><input required type="checkbox" className="mt-1" /> KVKK Aydınlatma Metni’ni okudum ve iletişim kurulmasını kabul ediyorum.</label><button className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-900 px-5 py-3.5 text-sm font-semibold text-white hover:bg-brand-800">Demo Talep Et <ArrowRight size={16}/></button></form>;
}
