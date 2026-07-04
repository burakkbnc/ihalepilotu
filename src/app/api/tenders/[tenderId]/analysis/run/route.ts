// ============================================================
// /api/tenders/[tenderId]/analysis/run
// POST -> İdari/Teknik şartname metinlerini analiz eder.
//
// Faz 3.5 NOTU: Bu route, kesin/regex ile güvenilir biçimde çıkarılabilir
// alanları üretir (idari meta, kritik tarihler, geçici/kesin teminat AYRI
// AYRI, resmi birim fiyat cetveli). Bu kısım DEĞİŞMEDEN kalır.
//
// Faz 4 NOTU: Faz 3.5 sonuçları Firestore'a yazıldıktan SONRA, AYRI bir
// adım olarak LLM analizi çalıştırılır ve yalnızca yeni 'llmAnalysis'
// section'ını üretir (iş özeti, katılım uygunluğu, iş deneyimi analizi,
// teminat analizi, ceza ve yaptırımlar, teknik yükümlülük özeti, gerekli
// belgeler özeti, riskler). LLM çağrısı BAŞARISIZ OLSA BİLE Faz 3.5
// sonuçları etkilenmez — analiz isteği yine de 201 ile başarılı döner,
// sadece llmAnalysis section'ı eksik/not_found kalır.
//
// Akış:
//   1. Girdi doğrulanır (en az bir metin gerekli)
//   2. runParserPipeline() çalıştırılır (sadece kesin alanlar) — DEĞİŞMEDİ
//   3. Her bölüm companies/.../tenders/{id}/analysis/{section} olarak yazılır
//   4. Bu çalıştırma companies/.../tenders/{id}/analysisRuns/{runId} olarak
//      Faz 4 hazırlık verisiyle (rawAdministrativeText, rawTechnicalText,
//      extractedFields, officialBoqItems, llmReady) kaydedilir
//   5. tender.hasAnalysis = true olarak güncellenir
//   6. Aktivite log'u yazılır
//   7. [FAZ 4] LLM analizi (ayrı, izole adım) çalıştırılır ve
//      analysis/llmAnalysis olarak yazılır — hata olursa sessizce
//      "not_found" bırakılır, ana akışı bozmaz.
//
// Yetki: owner/admin (analiz başlatmak bir "yazma" işlemidir)
// ============================================================
import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireRole, apiError, apiSuccess, withApiErrorHandling } from '@/lib/api/guard';
import { getTenderOrThrow } from '@/lib/tenders/access';
import { logActivity } from '@/lib/activity/log';
import { runParserPipeline } from '@/lib/parser/pipeline';
import { runAnalysisV2, mergeBoqV2 } from '@/lib/analysis-v2';
import { getLLMProvider } from '@/lib/llm';
import { runLlmAnalysis } from '@/lib/llm/llmAnalysis';
import type { AnalysisRun, RunAnalysisInput, TenderAnalysis, TenderItem } from '@/types/tender';

interface RouteParams {
  params: { tenderId: string };
}

const MAX_TEXT_LENGTH = 200000; // ~200k karakter güvenlik sınırı

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { session, profile, companyId } = await requireRole(['owner', 'admin']);
  const { ref, tender } = await getTenderOrThrow(companyId, params.tenderId);

  const body = (await req.json().catch(() => ({}))) as Partial<RunAnalysisInput>;

  const administrativeText = typeof body.administrativeText === 'string' ? body.administrativeText : '';
  const technicalText = typeof body.technicalText === 'string' ? body.technicalText : '';

  if (!administrativeText.trim() && !technicalText.trim()) {
    return apiError(
      400,
      'no_input_text',
      'Analiz için en az bir metin (İdari Şartname veya Teknik Şartname) girilmelidir.'
    );
  }

  if (administrativeText.length > MAX_TEXT_LENGTH || technicalText.length > MAX_TEXT_LENGTH) {
    return apiError(400, 'text_too_long', `Metin uzunluğu ${MAX_TEXT_LENGTH} karakteri aşamaz.`);
  }

  const now = new Date().toISOString();
  const runRef = ref.collection('analysisRuns').doc();

  let pipelineResult;
  try {
    pipelineResult = await runParserPipeline({
      tenderTitle: tender.title,
      administrativeText: administrativeText.trim() || null,
      technicalText: technicalText.trim() || null
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Bilinmeyen hata';

    const failedRun: AnalysisRun = {
      id: runRef.id,
      tenderId: tender.id,
      companyId,
      status: 'failed',
      administrativeTextLength: administrativeText.length,
      technicalTextLength: technicalText.length,
      rawAdministrativeText: null,
      rawTechnicalText: null,
      extractedFields: null,
      officialBoqItems: [],
      sectionsFound: 0,
      sectionsTotal: 0,
      conflictCount: 0,
      llmReady: false,
      llmStatus: 'not_attempted',
      llmErrorMessage: null,
      errorMessage,
      triggeredBy: session.uid,
      triggeredByName: profile.displayName,
      createdAt: now
    };

    await runRef.set(failedRun);

    await logActivity({
      companyId,
      tenderId: tender.id,
      type: 'analysis_failed',
      message: 'Şartname analizi başarısız oldu.',
      metadata: { runId: runRef.id, error: errorMessage },
      actor: { session, profile }
    });

    return apiError(500, 'analysis_failed', `Analiz çalıştırılırken hata oluştu: ${errorMessage}`);
  }

  // KÖK NEDEN DÜZELTMESİ (Aşama A — analysis-v2 koşulsuz çalışmasının
  // kaldırılması): Önceden `runAnalysisV2` (ağır regex/kural motoru) HER
  // istekte, gerçek bir LLM sağlayıcısı yapılandırılmış olsa BİLE
  // koşulsuz çalıştırılıyordu — oysa sonucu SADECE LLM_PROVIDER=mock
  // durumunda (aşağıdaki ruleBasedPreview bloğu) gerçekten kullanılıyordu.
  // Artık motor SADECE ihtiyaç duyulduğunda (mock branch'inde, lazy)
  // çalıştırılır. BFC (Birim Fiyat Cetveli) için de ARTIK tek kaynak
  // parser'dır (bkz. analysis-v2/boq.ts) — `mergeBoqV2` sadece parser'ın
  // idari+teknik çıktısını sıra no bazında konsolide eder, kendi regex
  // okumasını TEKRAR ÇALIŞTIRMAZ.
  const officialBoqItems = mergeBoqV2(pipelineResult.llmPrep.officialBoqItems);

  const batch = adminDb.batch();

  for (const section of pipelineResult.sections) {
    const sectionRef = ref.collection('analysis').doc(section.section);
    const doc: TenderAnalysis = {
      id: section.section,
      tenderId: tender.id,
      companyId,
      source: 'rule_based',
      data: section.data,
      generatedAt: now,
      updatedAt: now
    } as TenderAnalysis;

    batch.set(sectionRef, doc);
  }

  // Resmi Birim Fiyat Cetveli kalemlerini DOĞRUDAN düzenlenebilir Birim
  // Fiyat Cetveli'ne (items koleksiyonu) yazar — ayrı bir "Cetvele Aktar"
  // adımı YOKTUR (kullanıcı talebi). Önceki analiz çalıştırmasından kalan
  // otomatik-eklenmiş resmi cetvel satırları (sourceType=
  // 'official_bill_of_quantities') silinip yeniden yazılır; kullanıcının
  // MANUEL eklediği satırlara ('manual' source) ASLA dokunulmaz.
  const existingItemsSnap = await ref.collection('items').where('sourceType', '==', 'official_bill_of_quantities').get();
  for (const doc of existingItemsSnap.docs) {
    batch.delete(doc.ref);
  }

  officialBoqItems.forEach((boqItem, idx) => {
    const itemRef = ref.collection('items').doc();
    const quantity = boqItem.quantity ?? 1;
    const unitPrice = 0; // Kullanıcı tabloyu gördüğü anda kendisi girer
    const vatRate = 20; // Varsayılan, kullanıcı satır bazında değiştirebilir
    const total = 0;
    const vatAmount = 0;
    const grandTotal = 0;

    const item: TenderItem = {
      id: itemRef.id,
      tenderId: tender.id,
      companyId,
      orderNo: boqItem.orderNo || idx + 1,
      description: boqItem.name,
      unit: boqItem.unit ?? 'adet',
      quantity,
      unitPrice,
      vatRate,
      total,
      vatAmount,
      grandTotal,
      source: 'parser',
      category: null,
      sourceType: 'official_bill_of_quantities',
      parentOfficialItemName: null,
      shortNote: null,
      sourceDocument: boqItem.sourceDocument,
      sourceReference: null,
      confidence: boqItem.confidence,
      createdAt: now,
      updatedAt: now
    };

    batch.set(itemRef, item);
  });

  const sectionsFound = pipelineResult.sections.filter((s) => s.confidence === 'found').length;

  const run: AnalysisRun = {
    id: runRef.id,
    tenderId: tender.id,
    companyId,
    status: 'completed',
    administrativeTextLength: administrativeText.length,
    technicalTextLength: technicalText.length,
    rawAdministrativeText: pipelineResult.llmPrep.rawAdministrativeText,
    rawTechnicalText: pipelineResult.llmPrep.rawTechnicalText,
    extractedFields: pipelineResult.llmPrep.extractedFields as AnalysisRun['extractedFields'],
    officialBoqItems,
    sectionsFound,
    sectionsTotal: pipelineResult.sections.length,
    conflictCount: pipelineResult.conflictCount,
    llmReady: pipelineResult.llmPrep.llmReady,
    // LLM adımı henüz çalıştırılmadı — aşağıda (batch commit'ten SONRA)
    // gerçek sonuca göre güncellenecek ve Firestore'a tekrar yazılacak.
    llmStatus: 'not_attempted',
    llmErrorMessage: null,
    errorMessage: null,
    triggeredBy: session.uid,
    triggeredByName: profile.displayName,
    createdAt: now
  };

  batch.set(runRef, run);

  // Parser'ın tespit ettiği kritik tarihleri, üst ihale belgesine (Tender)
  // SADECE alan boşsa yazar. Kullanıcının manuel olarak girdiği bir tarih
  // ASLA otomatik olarak ezilmez (TenderInfoEditor üzerinden girilmiş olabilir).
  const criticalDatesSection = pipelineResult.sections.find((s) => s.section === 'criticalDates');
  const criticalDatesData = criticalDatesSection?.data as
    | { tenderDate: { value: string | null }; submissionDeadline: { value: string | null } }
    | undefined;

  const tenderUpdates: Record<string, unknown> = {
    hasAnalysis: true,
    conflictCount: pipelineResult.conflictCount,
    // Bu batch LLM adımından ÖNCE commit edilir (LLM sonucu henüz
    // bilinmiyor), bu yüzden başlangıç değeri olarak 0 yazılır. LLM
    // analizi başarıyla tamamlanırsa, aşağıda (LLM adımından SONRA)
    // gerçek risk sayısı ve genel risk skoru ile güncellenir.
    highRiskCount: 0,
    updatedAt: now,
    ...(tender.status === 'draft' || tender.status === 'documents_pending' ? { status: 'analysis_ready' } : {})
  };

  if (!tender.tenderDate && criticalDatesData?.tenderDate.value) {
    tenderUpdates.tenderDate = criticalDatesData.tenderDate.value;
  }
  if (!tender.submissionDeadline && criticalDatesData?.submissionDeadline.value) {
    tenderUpdates.submissionDeadline = criticalDatesData.submissionDeadline.value;
  }

  batch.update(ref, tenderUpdates);

  await batch.commit();

  await logActivity({
    companyId,
    tenderId: tender.id,
    type: 'analysis_completed',
    message:
      pipelineResult.conflictCount > 0
        ? `Şartname analizi tamamlandı (${sectionsFound}/${pipelineResult.sections.length} bölüm bulundu, ${pipelineResult.conflictCount} çelişki tespit edildi).`
        : `Şartname analizi tamamlandı (${sectionsFound}/${pipelineResult.sections.length} bölüm bulundu).`,
    metadata: {
      runId: runRef.id,
      sectionsFound,
      sectionsTotal: pipelineResult.sections.length,
      conflictCount: pipelineResult.conflictCount
    },
    actor: { session, profile }
  });

  // ------------------------------------------------------------
  // [FAZ 4] LLM Analizi — Faz 3.5 sonuçları ZATEN Firestore'a yazıldıktan
  // SONRA çalıştırılan, tamamen İZOLE bir adımdır. Bu adımda oluşan
  // herhangi bir hata (API hatası, geçersiz JSON, timeout vb.) Faz 3.5
  // sonuçlarını ETKİLEMEZ (analiz isteği yine de 201 ile başarılı döner),
  // AMA artık sessizce yutulmaz — run.llmStatus/llmErrorMessage üzerinden
  // hem Firestore'a hem de API response'una yansıtılır, UI bu bilgiyi
  // kullanarak "placeholder" yerine açık bir hata mesajı gösterebilir.
  // ------------------------------------------------------------
  let llmStatus: AnalysisRun['llmStatus'] = 'not_attempted';
  let llmErrorMessage: string | null = null;

  if (pipelineResult.llmPrep.llmReady) {
    const provider = getLLMProvider();

    if (provider.name === 'mock') {
      // KÖK NEDEN DÜZELTMESİ: Gerçek bir LLM anahtarı/sağlayıcısı yoksa,
      // regex/kural-tabanlı `analysis-v2` motorunun ürettiği sonuç ARTIK
      // 'llmAnalysis' section'ı olarak yazılmıyor ve kullanıcıya gerçek
      // yapay zeka analiziymiş gibi SUNULMUYOR. Önceki davranışta bu
      // durum llmStatus='completed' ile işaretleniyor ve v2Result.section
      // doğrudan 'llmAnalysis' koleksiyonuna yazılıyordu — bu, UI'da
      // "LLM destekli bölümler analysis_v2 tarafından üretilmiştir" gibi
      // yanıltıcı bir ifadeyle sonuçlanıyor ve kullanıcı bunun sabit
      // kalıp/regex çıktısı olduğunu ayırt edemiyordu.
      //
      // Yeni davranış: llmStatus='skipped_mock' olarak işaretlenir (bu
      // değer zaten AnalysisResultsView.tsx ve AnalysisRunForm.tsx
      // tarafından destekleniyordu, sadece hiç tetiklenmiyordu). Önceki
      // bir çalıştırmadan kalmış olabilecek 'llmAnalysis' section'ı da
      // silinir — aksi halde eski/gerçek bir LLM sonucu, yeni (LLM'siz)
      // çalıştırmanın sonucuymuş gibi ekranda kalmaya devam edebilirdi.
      //
      // `analysis-v2` motorunun ürettiği zengin içerik TAMAMEN atılmaz;
      // ayrı ve AÇIKÇA etiketlenmiş bir 'ruleBasedPreview' section'ı
      // olarak saklanır — UI bunu yalnızca "bu bir ön-tarama, yapay
      // zeka analizi değil" uyarısıyla birlikte gösterebilir.
      // analysis-v2 (ağır regex motoru) SADECE bu noktada, gerçekten
      // ihtiyaç duyulduğunda (mock/fallback durumu) çalıştırılır — bkz.
      // yukarıdaki kök neden düzeltmesi notu.
      const v2Result = await runAnalysisV2({
        tenderTitle: tender.title,
        companyId,
        tenderId: tender.id,
        administrativeText: administrativeText.trim() || null,
        technicalText: technicalText.trim() || null,
        ruleBasedSections: pipelineResult.sections,
        parserBoqItems: pipelineResult.llmPrep.officialBoqItems
      });
      await ref.collection('analysis').doc('llmAnalysis').delete();
      await ref.collection('analysis').doc('ruleBasedPreview').set({
        ...(v2Result.section as unknown as Record<string, unknown>),
        id: 'ruleBasedPreview',
        source: 'rule_based'
      } as unknown as TenderAnalysis);
      llmStatus = 'skipped_mock';
      llmErrorMessage = 'LLM_PROVIDER=mock veya API anahtarı tanımsız — gerçek yapay zeka analizi çalıştırılmadı.';
      (run as any).provider = provider.name;
      (run as any).model = null;
      (run as any).inputTokens = 0;
      (run as any).outputTokens = 0;
      (run as any).totalTokens = 0;
      (run as any).estimatedCostUsd = 0;
      // highRiskCount/genelRiskSkoru artık BURADA yazılmaz — bunlar
      // regex tabanlı tahminlerdir, gerçek LLM analizi tamamlanmadıkça
      // Tender belgesine "resmi" risk verisi olarak denormalize edilmez
      // (aşağıdaki `if (llmStatus === 'completed')` bloğu zaten bunu
      // otomatik olarak atlar).
      console.log(
        `[analysis] LLM sağlayıcı yok (mock) — ruleBasedPreview kaydedildi, llmAnalysis YAZILMADI (tenderId=${tender.id}, runId=${runRef.id}).`
      );
    } else {
      try {
        console.log(
          `[llm] Faz 4 analizi başlatılıyor (tenderId=${tender.id}, runId=${runRef.id}, provider=${provider.name}).`
        );

        const llmData = await runLlmAnalysis(provider, {
          tenderTitle: tender.title,
          ruleBasedSections: pipelineResult.sections,
          rawAdministrativeText: pipelineResult.llmPrep.rawAdministrativeText,
          rawTechnicalText: pipelineResult.llmPrep.rawTechnicalText,
          // Bu route (metin yapıştırma akışı) doküman bazlı zeyilname
          // ayrımı yapmıyor — zeyilname desteği sadece dosya yükleme
          // akışında (/analysis/from-documents) mevcuttur.
          zeyilnameText: null,
          parserBoqItems: pipelineResult.llmPrep.officialBoqItems
        });

        const llmUsage = (llmData as any)?.usage;
        if (llmUsage) {
          (run as any).provider = llmUsage.provider || provider.name;
          (run as any).model = llmUsage.model || null;
          (run as any).inputTokens = Number(llmUsage.inputTokens || 0);
          (run as any).outputTokens = Number(llmUsage.outputTokens || 0);
          (run as any).totalTokens = Number((run as any).inputTokens || 0) + Number((run as any).outputTokens || 0);
          (run as any).estimatedCostUsd = Number(llmUsage.estimatedCostUsd || 0);
        }

        const llmSectionDoc: TenderAnalysis = {
          id: 'llmAnalysis',
          tenderId: tender.id,
          companyId,
          source: 'llm',
          data: llmData,
          generatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as TenderAnalysis;

        await ref.collection('analysis').doc('llmAnalysis').set(llmSectionDoc);

        llmStatus = 'completed';
        console.log(
          `[llm] Faz 4 analizi başarıyla tamamlandı ve Firestore'a yazıldı (tenderId=${tender.id}, runId=${runRef.id}, provider=${provider.name}).`
        );
      } catch (err) {
        llmStatus = 'failed';
        llmErrorMessage = err instanceof Error ? err.message : 'Bilinmeyen LLM hatası';
        console.error(
          `[llm] Faz 4 analizi BAŞARISIZ oldu (tenderId=${tender.id}, runId=${runRef.id}, provider=${provider.name}):`,
          llmErrorMessage
        );

        // Faz 3.5 sonuçlarını bozmamak için llmAnalysis section'ı hiç
        // yazılmaz. Ama hata artık sessiz değil — aşağıda run belgesine
        // ve response'a yansıtılır.
        await logActivity({
          companyId,
          tenderId: tender.id,
          type: 'analysis_failed',
          message: `Faz 4 LLM analizi başarısız oldu: ${llmErrorMessage}`,
          metadata: { runId: runRef.id, error: llmErrorMessage, provider: provider.name },
          actor: { session, profile }
        });
      }
    }
  }

  // run belgesi LLM adımından ÖNCE batch içinde 'not_attempted' olarak
  // yazılmıştı (LLM sonucu o an henüz bilinmiyordu) — şimdi gerçek
  // sonuçla güncelleniyor. Bu, Faz 3.5 atomikliğini bozmaz (LLM adımı
  // zaten Faz 3.5 batch'inden sonra ayrı bir Firestore yazımıdır).
  run.llmStatus = llmStatus;
  run.llmErrorMessage = llmErrorMessage;
  await runRef.update({
    llmStatus,
    llmErrorMessage,
    provider: (run as any).provider || null,
    model: (run as any).model || null,
    inputTokens: (run as any).inputTokens ?? 0,
    outputTokens: (run as any).outputTokens ?? 0,
    totalTokens: (run as any).totalTokens ?? 0,
    estimatedCostUsd: (run as any).estimatedCostUsd ?? 0
  });

  // [DASHBOARD KPI BAĞLANTISI] LLM analizi başarıyla tamamlandıysa,
  // ürettiği risk verisini Tender belgesine denormalize eder — bu,
  // yukarıdaki "Faz 3.5'te risk analizi devre dışı, Faz 4 ile yeniden
  // aktif edilecek" notunun tamamlanmasıdır (önceden hep highRiskCount:0
  // yazılıyordu, hiçbir zaman güncellenmiyordu). Sadece llmStatus
  // 'completed' ise ve LLM gerçekten risk/skor verisi ürettiyse yazılır;
  // başarısız/atlanan/eksik veri durumunda Tender'ın risk alanları
  // DOKUNULMADAN bırakılır (sahte bir değer asla yazılmaz).
  if (llmStatus === 'completed') {
    const llmSectionSnap = await ref.collection('analysis').doc('llmAnalysis').get();
    const llmSectionData = llmSectionSnap.data() as TenderAnalysis | undefined;
    const llmData = llmSectionData?.data as
      | { riskler?: Array<{ seviye?: string }>; executiveSummary?: { genelRiskSkoru?: number } }
      | undefined;

    if (llmData) {
      const highRiskCount = (llmData.riskler ?? []).filter((r) => r.seviye === 'yüksek').length;
      const riskUpdates: Record<string, unknown> = { highRiskCount };
      if (typeof llmData.executiveSummary?.genelRiskSkoru === 'number') {
        riskUpdates.genelRiskSkoru = llmData.executiveSummary.genelRiskSkoru;
      }
      await ref.update(riskUpdates);
    }
  }

  const updatedAnalysisSnap = await ref.collection('analysis').get();
  const sections = updatedAnalysisSnap.docs.map((d) => d.data() as TenderAnalysis);

  // [UX DÜZELTMESİ] Resmi Birim Fiyat Cetveli satırları yukarıda batch
  // içinde Firestore'a yazıldı, ama önceki sürümde response'a HİÇ
  // dahil edilmiyordu — bu yüzden kullanıcı sayfayı manuel yenilemeden
  // cetveli göremiyordu. Artık güncel 'items' koleksiyonunun TAMAMI
  // (resmi cetvel + kullanıcının önceden eklediği manuel satırlar)
  // response'a dahil edilir; client (AnalysisTab.tsx) bu veriyle
  // TenderItemsPanel state'ini ANINDA güncelleyebilir, refetch veya
  // sayfa yenilemesi gerekmez.
  const updatedItemsSnap = await ref.collection('items').orderBy('orderNo', 'asc').get();
  const items = updatedItemsSnap.docs.map((d) => d.data() as TenderItem);

  return apiSuccess({ run, sections, items }, 201);
});
