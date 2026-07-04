import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireCompany, apiError, apiSuccess, withApiErrorHandling } from '@/lib/api/guard';
import { answerTenderAssistant } from '@/lib/chatbot/ihaleAssistant';
import type { CompanyDocument, PastTenderRecord } from '@/types';
import type { Tender, TenderAnalysis } from '@/types/tender';

const MAX_QUESTION_LENGTH = 500;

function cleanQuestion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_QUESTION_LENGTH) : null;
}

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenderId: string } }) => {
  const { companyId } = await requireCompany();
  const body = (await req.json().catch(() => ({}))) as { question?: unknown };
  const question = cleanQuestion(body.question);

  if (!question) return apiError(400, 'invalid_question', 'Soru boş olamaz.');

  const tenderRef = adminDb.collection('companies').doc(companyId).collection('tenders').doc(params.tenderId);
  const tenderSnap = await tenderRef.get();
  if (!tenderSnap.exists) return apiError(404, 'tender_not_found', 'İhale bulunamadı.');

  const [analysisSnap, companyDocumentsSnap, pastTendersSnap] = await Promise.all([
    tenderRef.collection('analysis').get(),
    adminDb.collection('companies').doc(companyId).collection('companyDocuments').orderBy('createdAt', 'desc').limit(100).get(),
    adminDb.collection('companies').doc(companyId).collection('pastTenders').orderBy('createdAt', 'desc').limit(100).get()
  ]);

  const answer = answerTenderAssistant({
    question,
    tender: tenderSnap.data() as Tender,
    analysisSections: analysisSnap.docs.map((doc) => doc.data() as TenderAnalysis),
    companyDocuments: companyDocumentsSnap.docs.map((doc) => doc.data() as CompanyDocument),
    pastTenders: pastTendersSnap.docs.map((doc) => doc.data() as PastTenderRecord)
  });

  return apiSuccess(answer);
});
