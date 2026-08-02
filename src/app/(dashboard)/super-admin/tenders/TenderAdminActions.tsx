'use client';

import { useState } from 'react';
import { ArchiveRestore, Trash2, XCircle } from 'lucide-react';
import { permanentlyDeleteTender, restoreTender, trashTender } from '../actions';

interface Props {
  companyId: string;
  tenderId: string;
  title: string;
  isDeleted: boolean;
}

export default function TenderAdminActions({ companyId, tenderId, title, isDeleted }: Props) {
  const [busy, setBusy] = useState(false);

  async function run(action: (formData: FormData) => Promise<void>, message: string) {
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set('companyId', companyId);
      formData.set('tenderId', tenderId);
      await action(formData);
    } finally {
      setBusy(false);
    }
  }

  if (isDeleted) {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(restoreTender, `“${title}” ihalesi geri yüklensin mi?`)}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          <ArchiveRestore size={14} /> Geri yükle
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(permanentlyDeleteTender, `“${title}” ihalesi, analizleri ve dosyaları KALICI olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?`)}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          <XCircle size={14} /> Kalıcı sil
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => run(trashTender, `“${title}” ihalesi çöp kutusuna taşınsın mı? Kullanıcı ekranlarından kaldırılacak, ancak geri yüklenebilecek.`)}
      className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
    >
      <Trash2 size={14} /> Çöp kutusuna taşı
    </button>
  );
}
