// ============================================================
// POST /api/auth/session
// Client'ta Firebase Auth ile giriş yapıldıktan sonra alınan
// ID token, güvenli bir HttpOnly session cookie'sine çevrilir.
// ============================================================
import { NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME, ensureSuperAdminProfile, getSessionContext } from '@/lib/auth/session';
import { apiError, apiSuccess, withApiErrorHandling } from '@/lib/api/guard';

const SESSION_EXPIRES_MS = Number(process.env.SESSION_COOKIE_EXPIRES_MS) || 60 * 60 * 24 * 5 * 1000; // 5 gün

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const { idToken } = await req.json();

  if (!idToken || typeof idToken !== 'string') {
    return apiError(400, 'invalid_request', 'idToken zorunludur.');
  }

  // Token'ı doğrula. Vercel/Firebase prod ortamında revoked-token kontrolü
  // bazı konfigürasyonlarda geçerli tokenları da reddedebildiği için
  // session oluşturma aşamasında temel ID token doğrulaması yapılır.
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return apiError(401, "invalid_token", "Geçersiz veya süresi dolmuş kimlik doğrulama token'ı.");
  }

  if (!decoded.email_verified && process.env.REQUIRE_EMAIL_VERIFICATION === 'true') {
    return apiError(403, 'email_not_verified', 'E-posta adresinizi doğrulamanız gerekiyor.');
  }

  await ensureSuperAdminProfile({
    uid: decoded.uid,
    email: decoded.email ?? '',
    displayName: decoded.name ?? null
  });

  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRES_MS
  });

  const res = apiSuccess({ uid: decoded.uid });

  res.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_EXPIRES_MS / 1000,
    path: '/'
  });

  return res;
});

// GET /api/auth/session — geçerli oturumu doğrular
// signIn/signUp sonrası session cookie'sinin gerçekten aktif olduğunu
// teyit etmek için kullanılır.
export const GET = withApiErrorHandling(async () => {
  const session = await getSessionContext();

  if (!session) {
    return apiError(401, 'unauthenticated', 'Aktif oturum bulunamadı.');
  }

  return apiSuccess({ uid: session.uid, email: session.email });
});

// DELETE /api/auth/session — çıkış yap
export const DELETE = withApiErrorHandling(async () => {
  const res = apiSuccess({ loggedOut: true });
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/'
  });
  return res;
});

// route.ts dosyalarının dinamik (her istekte yeniden çalışan) olması gerekir,
// çünkü cookie set/delete işlemi yapılır.
export const dynamic = 'force-dynamic';
