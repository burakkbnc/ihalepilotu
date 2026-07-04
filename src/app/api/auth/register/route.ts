// ============================================================
// POST /api/auth/register
// Client tarafında Firebase Auth ile kullanıcı oluşturulduktan sonra
// (createUserWithEmailAndPassword) çağrılır. Firestore'da users/{uid}
// profil kaydını oluşturur. companyId/role henüz null'dır —
// kullanıcı bir sonraki adımda şirket oluşturur veya davet ile katılır.
//
// Bu endpoint Firebase ID token gerektirir (Authorization: Bearer <idToken>)
// fakat henüz session cookie oluşturulmamış olabileceği için
// requireAuth() yerine doğrudan token doğrulaması yapılır.
// ============================================================
import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { apiError, apiSuccess, withApiErrorHandling } from '@/lib/api/guard';
import type { UserProfile } from '@/types';

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!idToken) {
    return apiError(401, 'missing_token', 'Authorization: Bearer <idToken> başlığı zorunludur.');
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return apiError(401, 'invalid_token', 'Geçersiz kimlik doğrulama token\'ı.');
  }

  const body = await req.json().catch(() => ({}));
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';

  if (!displayName || displayName.length < 2 || displayName.length > 80) {
    return apiError(400, 'invalid_display_name', 'Ad Soyad 2-80 karakter olmalıdır.');
  }

  const userRef = adminDb.collection('users').doc(decoded.uid);
  const existing = await userRef.get();

  if (existing.exists) {
    // Zaten kayıtlı — idempotent davran, mevcut profili döndür
    return apiSuccess({ profile: existing.data() as UserProfile });
  }

  const now = new Date().toISOString();
  const profile: UserProfile = {
    uid: decoded.uid,
    email: decoded.email || '',
    displayName,
    companyId: null,
    role: null,
    status: 'active',
    createdAt: now,
    updatedAt: now
  };

  await userRef.set(profile);

  // Auth tarafında da displayName senkronize edilsin
  await adminAuth.updateUser(decoded.uid, { displayName });

  return apiSuccess({ profile }, 201);
});
