// ============================================================
// /api/company/members/[uid]
// PATCH  -> Üye rolünü değiştirir (Sadece Owner)
// DELETE -> Üyeyi şirketten çıkarır (Sadece Owner)
// Owner kendi rolünü değiştiremez veya kendini silemez (kilitlenmeyi önler).
// ============================================================
import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  requireRole,
  apiError,
  apiSuccess,
  withApiErrorHandling,
  ApiError
} from '@/lib/api/guard';
import { setUserClaims } from '@/lib/auth/session';
import type { UserRole } from '@/types';

const ALLOWED_ROLES: UserRole[] = ['admin', 'member'];

interface RouteParams {
  params: { uid: string };
}

export const PATCH = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { session, companyId } = await requireRole(['owner']);
  const targetUid = params.uid;

  if (targetUid === session.uid) {
    throw new ApiError(400, 'cannot_modify_self', 'Owner kendi rolünü değiştiremez.');
  }

  const body = await req.json().catch(() => ({}));
  const role = body?.role as UserRole;

  if (!ALLOWED_ROLES.includes(role)) {
    return apiError(400, 'invalid_role', `Rol şu değerlerden biri olmalı: ${ALLOWED_ROLES.join(', ')}`);
  }

  const memberRef = adminDb.collection('companies').doc(companyId).collection('members').doc(targetUid);
  const memberSnap = await memberRef.get();

  if (!memberSnap.exists) {
    throw new ApiError(404, 'member_not_found', 'Üye bulunamadı.');
  }

  const now = new Date().toISOString();
  const batch = adminDb.batch();
  batch.update(memberRef, { role });
  batch.update(adminDb.collection('users').doc(targetUid), { role, updatedAt: now });
  await batch.commit();

  await setUserClaims(targetUid, { companyId, role });

  return apiSuccess({ uid: targetUid, role });
});

export const DELETE = withApiErrorHandling(async (_req: NextRequest, { params }: RouteParams) => {
  const { session, companyId } = await requireRole(['owner']);
  const targetUid = params.uid;

  if (targetUid === session.uid) {
    throw new ApiError(400, 'cannot_remove_self', 'Owner kendisini şirketten çıkaramaz.');
  }

  const memberRef = adminDb.collection('companies').doc(companyId).collection('members').doc(targetUid);
  const memberSnap = await memberRef.get();

  if (!memberSnap.exists) {
    throw new ApiError(404, 'member_not_found', 'Üye bulunamadı.');
  }

  const now = new Date().toISOString();
  const batch = adminDb.batch();
  batch.delete(memberRef);
  batch.update(adminDb.collection('users').doc(targetUid), {
    companyId: null,
    role: null,
    updatedAt: now
  });
  await batch.commit();

  await setUserClaims(targetUid, { companyId: null, role: null });

  return apiSuccess({ uid: targetUid, removed: true });
});
