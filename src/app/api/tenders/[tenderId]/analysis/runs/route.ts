// ============================================================
// /api/tenders/[tenderId]/analysis/runs
// GET -> İhalenin analiz çalıştırma geçmişini listeler
// ============================================================
import { NextRequest } from 'next/server';
import { requireCompany, apiSuccess, withApiErrorHandling } from '@/lib/api/guard';
import { getTenderOrThrow } from '@/lib/tenders/access';
import type { AnalysisRun } from '@/types/tender';

interface RouteParams {
  params: { tenderId: string };
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { companyId } = await requireCompany();
  const { ref } = await getTenderOrThrow(companyId, params.tenderId);

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;

  const snap = await ref.collection('analysisRuns').orderBy('createdAt', 'desc').limit(limit).get();
  const runs = snap.docs.map((d) => d.data() as AnalysisRun);

  return apiSuccess({ runs });
});
