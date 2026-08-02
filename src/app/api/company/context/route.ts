// ============================================================
// /api/company/context
// Client tarafında profil snapshot geciktiğinde güvenli şirket bağlamını döner.
// ============================================================
import { requireCompany, apiSuccess, withApiErrorHandling } from '@/lib/api/guard';

export const GET = withApiErrorHandling(async () => {
  const { profile, companyId } = await requireCompany();

  return apiSuccess({
    companyId,
    role: profile.role,
    displayName: profile.displayName,
    email: profile.email
  });
});

export const dynamic = 'force-dynamic';
