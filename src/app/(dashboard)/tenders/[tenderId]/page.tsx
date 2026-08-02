import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { redirectSuperAdminAwayFromCompanyApp } from '@/lib/auth/adminGuard';
import { adminDb } from '@/lib/firebase/admin';
import TenderStatusEditor from '@/components/tenders/TenderStatusEditor';
import TenderDocumentsPanel from '@/components/tenders/TenderDocumentsPanel';
import AnalysisTab from '@/components/tenders/AnalysisTab';
import type { AnalysisRun, Tender, TenderAnalysis, TenderDocument, TenderItem } from '@/types/tender';

interface PageProps {
  params: { tenderId: string };
}

export default async function TenderDetailPage({ params }: PageProps) {
  const result = await redirectSuperAdminAwayFromCompanyApp();
  const profile = result!.profile;
  const companyId = profile.companyId!;

  const tenderRef = adminDb.collection('companies').doc(companyId).collection('tenders').doc(params.tenderId);
  const tenderSnap = await tenderRef.get();

  if (!tenderSnap.exists) {
    notFound();
  }

  const tender = tenderSnap.data() as Tender;

  const [documentsSnap, itemsSnap, analysisSnap, analysisRunsSnap] = await Promise.all([
    tenderRef.collection('documents').orderBy('createdAt', 'asc').get(),
    tenderRef.collection('items').orderBy('orderNo', 'asc').get(),
    tenderRef.collection('analysis').get(),
    tenderRef.collection('analysisRuns').orderBy('createdAt', 'desc').limit(20).get()
  ]);

  const documents = documentsSnap.docs.map((d) => d.data() as TenderDocument);
  const items = itemsSnap.docs.map((d) => d.data() as TenderItem);
  const analysisSections = analysisSnap.docs.map((d) => d.data() as TenderAnalysis);
  const analysisRuns = analysisRunsSnap.docs.map((d) => d.data() as AnalysisRun);

  const editable = profile.role === 'owner' || profile.role === 'admin';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/tenders" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline">
          <ArrowLeft size={14} strokeWidth={2} aria-hidden />
          İhalelere geri dön
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{tender.title}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">İhale ID: {tender.id}</p>
          </div>
          <TenderStatusEditor tenderId={tender.id} status={tender.status} editable={editable} />
        </div>
      </div>
      <TenderDocumentsPanel tenderId={tender.id} companyId={companyId} initialDocuments={documents} editable={editable} />

      <AnalysisTab
        key={`${analysisRuns[0]?.id ?? 'no-run'}-${analysisSections.length}-${items.length}-${documents.map((document) => document.status).join('-')}`}
        tenderId={tender.id}
        tenderTitle={tender.title}
        referenceNumber={tender.referenceNumber}
        institutionName={tender.institutionName}
        initialSections={analysisSections}
        initialRuns={analysisRuns}
        initialItems={items}
        initialDocuments={documents}
        editable={editable}
      />

    </div>
  );
}
