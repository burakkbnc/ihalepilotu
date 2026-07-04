// ============================================================
// API Route Koruma Yardımcıları
// Tüm /api altındaki route'lar bu fonksiyonlarla korunmalıdır.
// ============================================================
import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/auth/session';
import type { ApiResponse, UserProfile, UserRole } from '@/types';
import type { SessionContext } from '@/lib/auth/session';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function apiError(status: number, code: string, message: string) {
  const body: ApiResponse = { success: false, error: { code, message } };
  return NextResponse.json(body, { status });
}

export function apiSuccess<T>(data: T, status = 200) {
  const body: ApiResponse<T> = { success: true, data };
  return NextResponse.json(body, { status });
}

/**
 * Geçerli oturumu ve Firestore profilini döner.
 * Oturum yoksa veya hesap devre dışıysa ApiError fırlatır (401).
 */
export async function requireAuth(): Promise<{ session: SessionContext; profile: UserProfile }> {
  const result = await getCurrentUserProfile();
  if (!result) {
    throw new ApiError(401, 'unauthenticated', 'Oturum geçersiz veya süresi dolmuş.');
  }
  return result;
}

/**
 * Kullanıcının bir şirkete bağlı olmasını zorunlu kılar.
 * companyId her zaman Firestore'daki profilden okunur — client'tan
 * gelen herhangi bir companyId değeri ASLA güvenilir kabul edilmez.
 */
export async function requireCompany(): Promise<{
  session: SessionContext;
  profile: UserProfile;
  companyId: string;
}> {
  const { session, profile } = await requireAuth();

  if (!profile.companyId || !profile.role) {
    throw new ApiError(403, 'no_company', 'Kullanıcı herhangi bir şirkete bağlı değil.');
  }

  return { session, profile, companyId: profile.companyId };
}

/**
 * Belirtilen rollerden birine sahip olmayı zorunlu kılar.
 * Örnek: await requireRole(['owner'])
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<{
  session: SessionContext;
  profile: UserProfile;
  companyId: string;
}> {
  const ctx = await requireCompany();

  if (!allowedRoles.includes(ctx.profile.role as UserRole)) {
    throw new ApiError(
      403,
      'forbidden_role',
      `Bu işlem için yetkiniz yok. Gerekli rol: ${allowedRoles.join(' / ')}`
    );
  }

  return ctx;
}

/**
 * API route handler'larını sarmalayarak ApiError'ları tutarlı JSON yanıtına çevirir.
 */
export function withApiErrorHandling<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return apiError(err.status, err.code, err.message);
      }
      console.error('Beklenmeyen API hatası:', err);
      return apiError(500, 'internal_error', 'Sunucu hatası oluştu.');
    }
  }) as T;
}
