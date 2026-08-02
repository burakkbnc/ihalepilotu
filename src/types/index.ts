// ============================================================
// İhale Pilotu — Faz 1 Tip Tanımları
// Kullanıcı, Şirket (Company), Rol ve Üyelik yapıları
// ============================================================

/** Sistemdeki kullanıcı rolleri (şirket bazlı) */
export type UserRole = 'super_admin' | 'admin_team' | 'owner' | 'admin' | 'member';

/**
 * users/{uid}
 * Firebase Auth UID birincil anahtardır.
 * Bir kullanıcı yalnızca TEK bir şirkete bağlıdır (Faz 1 kapsamı).
 */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  /** Kullanıcının bağlı olduğu şirket. companyId client tarafından değiştirilemez. */
  companyId: string | null;
  /** Şirket içindeki rolü */
  role: UserRole | null;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  /** Hesap durumu — Owner tarafından devre dışı bırakılabilir */
  status: 'active' | 'disabled';
  /** Platform yöneticileri için görev rolü */
  adminRole?: 'platform_admin' | 'operations_admin' | 'support_admin' | 'finance_admin' | 'content_admin' | null;
  /** Son başarılı oturum zamanı */
  lastLoginAt?: string | null;
}

/** Şirket paket / plan bilgisi (ileride paket yönetimi için) */
export interface CompanyPlan {
  name: 'trial' | 'starter' | 'pro' | 'enterprise' | string;
  tenderLimit: number | null;
  userLimit: number | null;
  analysisCredits: number | null;
  analysisCreditsRemaining: number | null;
  assistantQuestionLimit: number | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  billingStatus: 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled';
}

/**
 * companies/{companyId}
 * Tüm verinin (ihaleler, dokümanlar, analizler) üst kapsayıcısıdır.
 * Multi-tenant izolasyon companyId üzerinden sağlanır.
 */
export interface Company {
  id: string;
  name: string;
  /** Şirketi oluşturan kullanıcının uid'si */
  ownerId: string;
  plan: CompanyPlan;
  status: 'active' | 'suspended' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

/**
 * companies/{companyId}/members/{uid}
 * Şirket içindeki üyelik kaydı — hızlı rol/erişim kontrolü için
 * users koleksiyonundan ayrı tutulur (denormalize).
 */
export interface CompanyMember {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: 'active' | 'disabled';
  joinedAt: string;
}

/** Firebase Auth custom claims yapısı */
export interface AuthClaims {
  companyId: string | null;
  role: UserRole | null;
}

/** API başarı/hata yanıt zarfı */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}


// ============================================================
// Faz 11 — Şirket Hafızası Tipleri
// Şirket Belgeleri + Geçmiş İhaleler
// ============================================================

export type CompanyDocumentCategory =
  | 'kurumsal_belge'
  | 'kalite_belgesi'
  | 'is_deneyim_belgesi'
  | 'referans_belgesi'
  | 'yetki_belgesi'
  | 'katalog_brosur'
  | 'diger';

export interface CompanyDocument {
  id: string;
  companyId: string;
  title: string;
  category: CompanyDocumentCategory;
  issuer: string | null;
  validUntil: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  storagePath: string | null;
  downloadUrl?: string | null;
  note: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyDocumentInput {
  title: string;
  category: CompanyDocumentCategory;
  issuer?: string | null;
  validUntil?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  storagePath?: string | null;
  downloadUrl?: string | null;
  note?: string | null;
}

export type PastTenderResult = 'won' | 'lost' | 'cancelled' | 'ongoing' | 'no_bid';

export interface PastTenderRecord {
  id: string;
  companyId: string;
  tenderName: string;
  institution: string;
  year: number | null;
  tenderDate: string | null;
  offerAmount: number | null;
  currency: 'TRY' | 'USD' | 'EUR';
  result: PastTenderResult;
  relatedDocumentIds: string[];
  note: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePastTenderRecordInput {
  tenderName: string;
  institution: string;
  year?: number | null;
  tenderDate?: string | null;
  offerAmount?: number | null;
  currency?: 'TRY' | 'USD' | 'EUR';
  result: PastTenderResult;
  relatedDocumentIds?: string[];
  note?: string | null;
}
