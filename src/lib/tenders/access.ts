// ============================================================
// Tender erişim yardımcıları
// Bir ihalenin, çağıran kullanıcının şirketine ait olduğunu doğrular.
// ============================================================
import { adminDb } from '@/lib/firebase/admin';
import { ApiError } from '@/lib/api/guard';
import type { DocumentReference } from 'firebase-admin/firestore';
import type { Tender } from '@/types/tender';

/**
 * companies/{companyId}/tenders/{tenderId} belgesini getirir.
 * Belge yoksa 404 ApiError fırlatır. companyId her zaman çağıran
 * tarafından (requireCompany/requireRole sonucundan) sağlanmalıdır —
 * bu fonksiyon başka bir şirketin ihalesine erişimi mümkün KILMAZ
 * çünkü path zaten companyId ile sınırlandırılmıştır.
 */
export async function getTenderOrThrow(
  companyId: string,
  tenderId: string
): Promise<{ ref: DocumentReference; tender: Tender }> {
  const ref = adminDb.collection('companies').doc(companyId).collection('tenders').doc(tenderId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new ApiError(404, 'tender_not_found', 'İhale bulunamadı.');
  }

  return { ref, tender: snap.data() as Tender };
}
