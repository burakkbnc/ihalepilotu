// ============================================================
// Aktivite Kaydı Yardımcısı
// İhale üzerindeki olayları companies/{companyId}/tenders/{tenderId}/activities
// alt koleksiyonuna yazar.
// ============================================================
import { adminDb } from '@/lib/firebase/admin';
import type { Activity, ActivityType } from '@/types/tender';
import type { SessionContext } from '@/lib/auth/session';
import type { UserProfile, UserRole } from '@/types';

interface LogActivityParams {
  companyId: string;
  tenderId: string;
  type: ActivityType;
  message: string;
  metadata?: Record<string, unknown> | null;
  actor: {
    session: SessionContext;
    profile: UserProfile;
  };
}

export async function logActivity({
  companyId,
  tenderId,
  type,
  message,
  metadata = null,
  actor
}: LogActivityParams): Promise<void> {
  const now = new Date().toISOString();
  const activityRef = adminDb
    .collection('companies')
    .doc(companyId)
    .collection('tenders')
    .doc(tenderId)
    .collection('activities')
    .doc();

  const activity: Activity = {
    id: activityRef.id,
    tenderId,
    companyId,
    type,
    message,
    metadata,
    actorUid: actor.session.uid,
    actorName: actor.profile.displayName,
    actorRole: (actor.profile.role as UserRole) ?? 'member',
    createdAt: now
  };

  await activityRef.set(activity);
}
