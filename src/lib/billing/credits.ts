import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { ApiError } from '@/lib/api/guard';

export type CreditOperation = 'analysis' | 'analysis_refund' | 'admin_adjustment';

export async function reserveAnalysisCredit(input: {
  companyId: string;
  tenderId: string;
  userId: string;
  runId: string;
}) {
  const companyRef = adminDb.collection('companies').doc(input.companyId);
  const tenderRef = companyRef.collection('tenders').doc(input.tenderId);
  const movementRef = companyRef.collection('creditMovements').doc(input.runId);

  await adminDb.runTransaction(async (tx) => {
    const [companySnap, tenderSnap, movementSnap] = await Promise.all([
      tx.get(companyRef), tx.get(tenderRef), tx.get(movementRef)
    ]);
    if (!companySnap.exists) throw new ApiError(404, 'company_not_found', 'Şirket bulunamadı.');
    if (!tenderSnap.exists) throw new ApiError(404, 'tender_not_found', 'İhale bulunamadı.');
    if (movementSnap.exists) return;

    const company = companySnap.data() || {};
    if (company.status === 'disabled') throw new ApiError(403, 'company_inactive', 'Şirket hesabı kullanıma kapalıdır.');
    if (company.status === 'suspended') throw new ApiError(403, 'company_suspended', 'Şirket hesabı askıdadır; yeni analiz başlatılamaz.');
    const tender = tenderSnap.data() || {};
    const activeRunId = tender.analysisLock?.runId as string | undefined;
    const lockExpiresAt = tender.analysisLock?.expiresAt ? Date.parse(tender.analysisLock.expiresAt) : 0;
    if (activeRunId && lockExpiresAt > Date.now()) {
      throw new ApiError(409, 'analysis_in_progress', 'Bu ihale için başka bir analiz halen çalışıyor.');
    }

    const defaultCreditsByPlan: Record<string, number> = { free: 1, trial: 3, starter: 25, pro: 100, enterprise: 1000 };
    const legacyDefault = defaultCreditsByPlan[String(company.plan?.name || 'free')] ?? 1;
    const credits = Number(company.plan?.analysisCreditsRemaining ?? company.plan?.analysisCredits ?? legacyDefault);
    if (!Number.isFinite(credits) || credits < 1) {
      throw new ApiError(402, 'insufficient_credits', 'Ücretsiz analiz hakkınız kullanıldı. Devam etmek için bir paket seçin.');
    }

    const now = new Date();
    tx.update(companyRef, {
      'plan.analysisCreditsRemaining': credits - 1,
      updatedAt: now.toISOString()
    });
    tx.set(movementRef, {
      id: movementRef.id,
      companyId: input.companyId,
      tenderId: input.tenderId,
      runId: input.runId,
      userId: input.userId,
      operation: 'analysis' satisfies CreditOperation,
      amount: -1,
      status: 'reserved',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
    tx.set(tenderRef, {
      analysisLock: {
        runId: input.runId,
        userId: input.userId,
        acquiredAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 20 * 60 * 1000).toISOString()
      },
      updatedAt: now.toISOString()
    }, { merge: true });
  });
}

export async function finalizeAnalysisCredit(input: {
  companyId: string;
  tenderId: string;
  runId: string;
  success: boolean;
  usage?: { provider?: string | null; model?: string | null; inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number };
}) {
  const companyRef = adminDb.collection('companies').doc(input.companyId);
  const tenderRef = companyRef.collection('tenders').doc(input.tenderId);
  const movementRef = companyRef.collection('creditMovements').doc(input.runId);
  const usageRef = adminDb.collection('usageEvents').doc(input.runId);

  await adminDb.runTransaction(async (tx) => {
    const [companySnap, movementSnap] = await Promise.all([tx.get(companyRef), tx.get(movementRef)]);
    const movement = movementSnap.data() || {};
    if (movement.status === 'completed' || movement.status === 'refunded') return;
    const now = new Date().toISOString();
    if (!input.success && companySnap.exists) {
      const company = companySnap.data() || {};
      const credits = Number(company.plan?.analysisCreditsRemaining ?? 0);
      tx.update(companyRef, { 'plan.analysisCreditsRemaining': credits + 1, updatedAt: now });
    }
    tx.set(movementRef, { status: input.success ? 'completed' : 'refunded', updatedAt: now }, { merge: true });
    tx.set(tenderRef, { analysisLock: FieldValue.delete(), updatedAt: now }, { merge: true });
    tx.set(usageRef, {
      id: usageRef.id,
      companyId: input.companyId,
      tenderId: input.tenderId,
      runId: input.runId,
      operation: 'analysis',
      status: input.success ? 'completed' : 'failed',
      provider: input.usage?.provider ?? null,
      model: input.usage?.model ?? null,
      inputTokens: Number(input.usage?.inputTokens || 0),
      outputTokens: Number(input.usage?.outputTokens || 0),
      totalTokens: Number(input.usage?.inputTokens || 0) + Number(input.usage?.outputTokens || 0),
      estimatedCostUsd: Number(input.usage?.estimatedCostUsd || 0),
      createdAt: now
    }, { merge: true });
  });
}
