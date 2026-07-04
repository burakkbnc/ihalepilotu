// ============================================================
// /api/tenders/[tenderId]/analysis
// GET -> İhalenin mevcut analiz sonuçlarını getirir (8 bölüm + AI özet)
// ============================================================
import { NextRequest } from 'next/server';
import { requireCompany, apiSuccess, withApiErrorHandling } from '@/lib/api/guard';
import { getTenderOrThrow } from '@/lib/tenders/access';
import type { TenderAnalysis } from '@/types/tender';

interface RouteParams {
  params: { tenderId: string };
}

export const GET = withApiErrorHandling(async (_req: NextRequest, { params }: RouteParams) => {
  const { companyId } = await requireCompany();
  const { ref } = await getTenderOrThrow(companyId, params.tenderId);

  const snap = await ref.collection('analysis').get();
  const sections = snap.docs.map((d) => d.data() as TenderAnalysis);

  return apiSuccess({ sections });
});
