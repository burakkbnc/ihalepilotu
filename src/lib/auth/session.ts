// ============================================================
// Sunucu Tarafı Oturum Yönetimi
// Firebase session cookie doğrulama ve kullanıcı/şirket bağlamı
// ============================================================
import { cookies } from 'next/headers';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type { AuthClaims, UserProfile } from '@/types';
import { isSuperAdminEmail } from '@/lib/auth/superAdmin';

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'ihale_pilotu_session';

export interface SessionContext {
  uid: string;
  email: string;
  companyId: string | null;
  role: UserClaimRole;
}

type UserClaimRole = AuthClaims['role'];

/**
 * İstek üzerindeki session cookie'sini doğrular.
 * Geçersiz/eksikse null döner — çağıran taraf 401 dönmelidir.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);

    const claims = decoded as typeof decoded & Partial<AuthClaims>;
    const email = decoded.email ?? '';
    const superAdminByEmail = isSuperAdminEmail(email);

    return {
      uid: decoded.uid,
      email,
      companyId: superAdminByEmail ? null : claims.companyId ?? null,
      role: superAdminByEmail ? 'super_admin' : claims.role ?? null
    };
  } catch {
    return null;
  }
}

/**
 * Firebase Auth üzerinden manuel oluşturulan Super Admin kullanıcılarında
 * normal kayıt akışı çalışmadığı için users/{uid} profili bulunmayabilir.
 * SUPER_ADMIN_EMAILS içinde yer alan kullanıcı giriş yaptığında profil otomatik
 * oluşturulur/güncellenir. Böylece admin kullanıcı şirket oluşturma ekranına düşmez.
 */
export async function ensureSuperAdminProfile(params: {
  uid: string;
  email: string;
  displayName?: string | null;
}): Promise<UserProfile | null> {
  const email = params.email.trim().toLowerCase();
  if (!isSuperAdminEmail(email)) return null;

  const now = new Date().toISOString();
  const ref = adminDb.collection('users').doc(params.uid);
  const snap = await ref.get();

  const existing = snap.exists ? (snap.data() as Partial<UserProfile>) : null;
  const profile: UserProfile = {
    uid: params.uid,
    email,
    displayName: existing?.displayName || params.displayName || email.split('@')[0] || 'Super Admin',
    companyId: null,
    role: 'super_admin',
    status: 'active',
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  await ref.set(profile, { merge: true });

  // Bir sonraki token yenilemede de rol doğru gelsin diye claim yazılır.
  await setUserClaims(params.uid, { companyId: null, role: 'super_admin' }).catch(() => undefined);

  return profile;
}

/**
 * Oturum bağlamını ve Firestore'daki güncel kullanıcı profilini birlikte döner.
 * Custom claim'ler (companyId/role) ile Firestore profili senkron olmalıdır;
 * tutarsızlık durumunda Firestore kaynak kabul edilir.
 */
export async function getCurrentUserProfile(): Promise<{
  session: SessionContext;
  profile: UserProfile;
} | null> {
  const session = await getSessionContext();
  if (!session) return null;

  const snap = await adminDb.collection('users').doc(session.uid).get();

  if (!snap.exists) {
    const superAdminProfile = await ensureSuperAdminProfile({ uid: session.uid, email: session.email });
    return superAdminProfile ? { session, profile: superAdminProfile } : null;
  }

  const profile = snap.data() as UserProfile;

  if (isSuperAdminEmail(session.email) && profile.role !== 'super_admin') {
    const superAdminProfile = await ensureSuperAdminProfile({
      uid: session.uid,
      email: session.email,
      displayName: profile.displayName
    });
    return superAdminProfile ? { session, profile: superAdminProfile } : null;
  }

  if (profile.status === 'disabled') {
    return null;
  }

  return { session, profile };
}

/**
 * companyId+role custom claim'lerini Firebase Auth kullanıcısına yazar.
 * Şirket oluşturma / kullanıcı ekleme / rol değişikliği sonrasında çağrılmalıdır.
 * Claim güncellemesi yalnızca KULLANICININ SONRAKİ TOKEN YENİLEMESİNDE
 * (veya yeniden login'de) etkili olur — bu yüzden Firestore her zaman
 * gerçek kaynak (source of truth) olarak da güncellenir.
 */
export async function setUserClaims(uid: string, claims: AuthClaims): Promise<void> {
  await adminAuth.setCustomUserClaims(uid, claims);
}
