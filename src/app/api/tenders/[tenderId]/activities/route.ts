// ============================================================
// /api/tenders/[tenderId]/activities
// GET -> İhalenin aktivite geçmişini listeler (owner/admin/member)
// ============================================================
import { NextRequest } from 'next/server';
import { requireCompany, apiSuccess, withApiErrorHandling } from '@/lib/api/guard';
import { getTenderOrThrow } from '@/lib/tenders/access';
import type { Activity } from '@/types/tender';

interface RouteParams {
  params: { tenderId: string };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { companyId } = await requireCompany();
  const { ref } = await getTenderOrThrow(companyId, params.tenderId);

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;

  const snap = await ref.collection('activities').orderBy('createdAt', 'desc').limit(limit).get();

  const activities = snap.docs.map((d) => d.data() as Activity);

  return apiSuccess({ activities });
});
