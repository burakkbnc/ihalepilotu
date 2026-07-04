// ============================================================
// POST /api/company/create
// Yeni kullanıcı kayıt sonrası ilk şirketini oluşturur.
// Kullanıcı zaten bir şirkete bağlıysa hata döner (Faz 1: tek şirket/kullanıcı).
// Oluşturan kullanıcı otomatik olarak "owner" rolü alır.
// ============================================================
import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuth, apiError, apiSuccess, withApiErrorHandling, ApiError } from '@/lib/api/guard';
import { setUserClaims } from '@/lib/auth/session';
import type { Company, CompanyMember, UserProfile } from '@/types';

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const { session, profile } = await requireAuth();

  if (profile.companyId) {
    throw new ApiError(409, 'already_has_company', 'Kullanıcı zaten bir şirkete bağlı.');
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!name || name.length < 2 || name.length > 120) {
    return apiError(400, 'invalid_name', 'Şirket adı 2-120 karakter olmalıdır.');
  }

  const now = new Date().toISOString();
  const companyRef = adminDb.collection('companies').doc();

  const company: Company = {
    id: companyRef.id,
    name,
    ownerId: session.uid,
    plan: {
      name: 'trial',
      tenderLimit: 5,
      userLimit: 5
    },
    createdAt: now,
    updatedAt: now
  };

  const member: CompanyMember = {
    uid: session.uid,
    email: profile.email,
    displayName: profile.displayName,
    role: 'owner',
    status: 'active',
    joinedAt: now
  };

  const userUpdate: Partial<UserProfile> = {
    companyId: company.id,
    role: 'owner',
    updatedAt: now
  };

  // Atomik yazım: şirket dokümanı + üyelik kaydı + kullanıcı profili güncellemesi
  const batch = adminDb.batch();
  batch.set(companyRef, company);
  batch.set(companyRef.collection('members').doc(session.uid), member);
  batch.update(adminDb.collection('users').doc(session.uid), userUpdate);
  await batch.commit();

  // Auth custom claims güncelle (sonraki token yenilemesinde aktif olur)
  await setUserClaims(session.uid, { companyId: company.id, role: 'owner' });

  return apiSuccess({ company }, 201);
});
