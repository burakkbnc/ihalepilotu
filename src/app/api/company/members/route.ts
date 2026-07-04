// ============================================================
// /api/company/members
// GET  -> Şirketin tüm üyelerini listeler (owner/admin/member görebilir)
// POST -> Yeni üye davet eder / mevcut Auth kullanıcısını şirkete bağlar
//         (Sadece Owner)
// ============================================================
import { NextRequest } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import {
  requireCompany,
  requireRole,
  apiError,
  apiSuccess,
  withApiErrorHandling,
  ApiError
} from '@/lib/api/guard';
import { setUserClaims } from '@/lib/auth/session';
import type { CompanyMember, UserProfile, UserRole } from '@/types';

const ALLOWED_ROLES: UserRole[] = ['admin', 'member'];

export const GET = withApiErrorHandling(async () => {
  const { companyId } = await requireCompany();

  const snap = await adminDb
    .collection('companies')
    .doc(companyId)
    .collection('members')
    .orderBy('joinedAt', 'asc')
    .get();

  const members = snap.docs.map((d) => d.data() as CompanyMember);

  return apiSuccess({ members });
});

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const { companyId } = await requireRole(['owner']);

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = body?.role as UserRole;

  if (!email) {
    return apiError(400, 'invalid_email', 'E-posta adresi zorunludur.');
  }

  if (!ALLOWED_ROLES.includes(role)) {
    return apiError(400, 'invalid_role', `Rol şu değerlerden biri olmalı: ${ALLOWED_ROLES.join(', ')}`);
  }

  // Plan limiti kontrolü
  const companyRef = adminDb.collection('companies').doc(companyId);
  const companySnap = await companyRef.get();
  const company = companySnap.data();
  const userLimit = company?.plan?.userLimit as number | null | undefined;

  if (userLimit !== null && userLimit !== undefined) {
    const membersSnap = await companyRef.collection('members').count().get();
    if (membersSnap.data().count >= userLimit) {
      throw new ApiError(
        403,
        'user_limit_reached',
        `Şirket kullanıcı limitine (${userLimit}) ulaşıldı. Lütfen paketi yükseltin.`
      );
    }
  }

  // Hedef kullanıcı Firebase Auth'ta var mı?
  let targetUser;
  try {
    targetUser = await adminAuth.getUserByEmail(email);
  } catch {
    throw new ApiError(
      404,
      'user_not_found',
      'Bu e-posta ile kayıtlı bir kullanıcı bulunamadı. Kullanıcı önce kayıt olmalıdır.'
    );
  }

  const targetUid = targetUser.uid;

  const userDocRef = adminDb.collection('users').doc(targetUid);
  const userDocSnap = await userDocRef.get();
  const targetProfile = userDocSnap.data() as UserProfile | undefined;

  if (targetProfile?.companyId) {
    throw new ApiError(409, 'user_already_in_company', 'Kullanıcı zaten bir şirkete bağlı.');
  }

  const now = new Date().toISOString();

  const member: CompanyMember = {
    uid: targetUid,
    email,
    displayName: targetUser.displayName || email,
    role,
    status: 'active',
    joinedAt: now
  };

  const batch = adminDb.batch();
  batch.set(companyRef.collection('members').doc(targetUid), member);
  batch.set(
    userDocRef,
    {
      uid: targetUid,
      email,
      displayName: targetUser.displayName || email,
      companyId,
      role,
      status: 'active',
      createdAt: targetProfile?.createdAt || now,
      updatedAt: now
    } satisfies UserProfile,
    { merge: true }
  );
  await batch.commit();

  await setUserClaims(targetUid, { companyId, role });

  return apiSuccess({ member }, 201);
});
