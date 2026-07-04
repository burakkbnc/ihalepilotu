import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  requireRole,
  apiError,
  apiSuccess,
  withApiErrorHandling,
} from "@/lib/api/guard";
import { getTenderOrThrow } from "@/lib/tenders/access";
import { logActivity } from "@/lib/activity/log";
import { runParserPipeline } from "@/lib/parser/pipeline";
import { extractTextFromTenderDocuments } from "@/lib/documents/extractText";
import { runAnalysisV2, mergeBoqV2, countSections } from "@/lib/analysis-v2";
import { getLLMProvider } from "@/lib/llm";
import { runLlmAnalysis } from "@/lib/llm/llmAnalysis";
import type {
  AnalysisRun,
  TenderAnalysis,
  TenderDocument,
  TenderItem,
  LlmBoqKalemi,
  TenderAnalysisLlmAnalysis,
} from "@/types/tender";
import type { AnalysisV2Output } from "@/lib/analysis-v2";

// SPRINT NOTU (kritik bug — "Failed to fetch"): Büyük/taranmış
// dokümanlarda chunk'lı Vision analizi birkaç dakika sürebilir (78
// sayfalık bir dokümanda paralel chunk'larla bile ~3-4 dakika). Next.js
// route segment config'i ile bu route'un izin verilen maksimum çalışma
// süresini uzatıyoruz. Bu SADECE Vercel gibi platformlarda (serverless
// fonksiyon süresini sınırlayan) etkilidir; `next dev`/kendi sunucunuzda
// (Node'un kendi HTTP sunucusu) bunun etkisi yoktur — o durumda gerçek
// düzeltme chunk'ları PARALEL çalıştırmaktı (bkz. llmAnalysis.ts).
export const maxDuration = 300;

const NOT_DETECTED_MARKER = "tespit_edilemedi";

/**
 * LLM'in metin olarak döndürdüğü sayısal alanları (miktar/birim fiyat/KDV)
 * güvenli şekilde ayrıştırır. Ayrıştırılamıyorsa null döner — UYDURMA
 * YAPILMAZ, çağıran kod null durumunda güvenli bir varsayılana düşer
 * (miktar=1, fiyat=0, KDV=%20 — kullanıcı "Kalemler" sekmesinde düzeltir).
 */
function parseLlmNumericField(raw: string | undefined | null): number | null {
  if (!raw || raw === NOT_DETECTED_MARKER) return null;
  const cleaned = raw
    .replace(/%/g, "")
    .replace(/tl|try|₺/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!cleaned) return null;
  const hasComma = cleaned.includes(",");
  const normalized = hasComma ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  const num = Number(normalized);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : null;
}

interface RouteParams {
  params: { tenderId: string };
}

const ANALYZABLE_TYPES: TenderDocument["documentType"][] = [
  "idari_sartname",
  "teknik_sartname",
  "birim_fiyat_cetveli",
  "zeyilname",
  "ek_belge",
];

export const POST = withApiErrorHandling(
  async (_req: NextRequest, { params }: RouteParams) => {
    const { session, profile, companyId } = await requireRole([
      "owner",
      "admin",
    ]);
    const { ref, tender } = await getTenderOrThrow(companyId, params.tenderId);

    const documentsSnap = await ref
      .collection("documents")
      .orderBy("createdAt", "asc")
      .get();
    const documents = documentsSnap.docs.map((d) => d.data() as TenderDocument);
    const sourceDocuments = documents.filter(
      (doc) => doc.storagePath && ANALYZABLE_TYPES.includes(doc.documentType),
    );

    if (sourceDocuments.length === 0) {
      return apiError(
        400,
        "no_uploaded_documents",
        "Analiz için önce idari/teknik şartname veya ek doküman yükleyin.",
      );
    }

    const now = new Date().toISOString();

    await ref.update({ status: "processing", updatedAt: now });
    await Promise.all(
      sourceDocuments.map((doc) =>
        ref
          .collection("documents")
          .doc(doc.id)
          .update({
            status: "extracting_text",
            errorMessage: null,
            updatedAt: now,
          }),
      ),
    );

    const extraction = await extractTextFromTenderDocuments(sourceDocuments);

    await Promise.all(
      sourceDocuments.map((doc) => {
        const hasText = extraction.extracted.some(
          (item) => item.documentId === doc.id,
        );
        const hasImages = extraction.extractedImages.some(
          (item) => item.documentId === doc.id,
        );
        const ok = hasText || hasImages;
        const issue = extraction.issues.find(
          (item) => item.documentId === doc.id,
        );
        return ref
          .collection("documents")
          .doc(doc.id)
          .update({
            status: ok
              ? "analyzing"
              : issue?.code === "empty_text" ||
                  issue?.code === "unsupported_type" ||
                  issue?.code === "render_failed" ||
                  issue?.code === "ocr_failed"
                ? "ocr_required"
                : "failed",
            errorMessage: ok ? null : issue?.message || "Metin/görüntü çıkarılamadı.",
            updatedAt: new Date().toISOString(),
          });
      }),
    );

    // SPRINT NOTU (Vision LLM): Metin tabanlı dokümanlar eskisi gibi
    // idari/teknik metin bloklarına birleştirilir. Görsel/taranmış
    // dokümanlar (extractedImages) AYRICA idari/teknik olarak
    // gruplanır ve LLM'e DOĞRUDAN görüntü olarak gönderilir (metne
    // çevrilmeye ÇALIŞILMAZ) — bkz. providers/anthropic.ts.
    const administrativeText = extraction.extracted
      .filter((doc) => doc.documentType === "idari_sartname")
      .map((doc) => `# ${doc.fileName}\n${doc.text}`)
      .join("\n\n");

    const technicalText = extraction.extracted
      .filter(
        (doc) =>
          doc.documentType === "teknik_sartname" ||
          doc.documentType === "birim_fiyat_cetveli" ||
          doc.documentType === "ek_belge",
      )
      .map((doc) => `# ${doc.fileName}\n${doc.text}`)
      .join("\n\n");

    // SPRINT NOTU (Zeyilname/Düzeltme İlanı Desteği): zeyilname
    // dokümanları AYRI bir bağlam olarak, KRONOLOJİK SIRAYLA (belge
    // tarihine göre; tarih girilmemişse yükleme sırasına göre) LLM'e
    // gönderilir. İdari/teknik metin bloklarına KARIŞTIRILMAZ — LLM'in
    // "bu bir güncelleme kaynağıdır" bilgisini net şekilde alması için.
    const documentChronoKey = (documentId: string): number => {
      const doc = sourceDocuments.find((d) => d.id === documentId);
      const dateValue = doc?.documentDate || doc?.createdAt;
      const parsed = dateValue ? Date.parse(dateValue) : NaN;
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const zeyilnameDocs = extraction.extracted
      .filter((doc) => doc.documentType === "zeyilname")
      .sort((a, b) => documentChronoKey(a.documentId) - documentChronoKey(b.documentId));

    const zeyilnameText = zeyilnameDocs
      .map((doc) => {
        const sourceDoc = sourceDocuments.find((d) => d.id === doc.documentId);
        const dateLabel = sourceDoc?.documentDate
          ? `Tarih: ${sourceDoc.documentDate}`
          : "Tarih: belirtilmemiş (yükleme sırası esas alındı)";
        return `# ${doc.fileName} (${dateLabel})\n${doc.text}`;
      })
      .join("\n\n");

    const administrativeImages = extraction.extractedImages.filter(
      (doc) => doc.documentType === "idari_sartname",
    );
    const technicalImages = extraction.extractedImages.filter(
      (doc) =>
        doc.documentType === "teknik_sartname" ||
        doc.documentType === "birim_fiyat_cetveli" ||
        doc.documentType === "ek_belge",
    );
    const zeyilnameImages = extraction.extractedImages
      .filter((doc) => doc.documentType === "zeyilname")
      .sort((a, b) => documentChronoKey(a.documentId) - documentChronoKey(b.documentId));
    const hasAnyImages = extraction.extractedImages.length > 0;

    if (
      !administrativeText.trim() &&
      !technicalText.trim() &&
      !zeyilnameText.trim() &&
      !hasAnyImages
    ) {
      await ref.update({
        status: "documents_pending",
        updatedAt: new Date().toISOString(),
      });

      await logActivity({
        companyId,
        tenderId: tender.id,
        type: "analysis_failed",
        message: "Dokümanlardan analiz için yeterli metin çıkarılamadı.",
        metadata: { issues: extraction.issues },
        actor: { session, profile },
      });

      return apiError(
        422,
        "no_extractable_text",
        "Yüklenen dosyalardan analiz için yeterli metin/görüntü çıkarılamadı. Dosyalar taranmış PDF veya görsel ise sayfa görüntüleri Vision destekli LLM'e gönderilir; bu adım başarısız olduysa dosya kalitesini kontrol edin.",
      );
    }

    const runRef = ref.collection("analysisRuns").doc();

    try {
      const pipelineResult = await runParserPipeline({
        tenderTitle: tender.title,
        administrativeText: administrativeText.trim() || null,
        technicalText: technicalText.trim() || null,
      });

      // KÖK NEDEN DÜZELTMESİ (Aşama A — BFC tek kaynak + analysis-v2
      // koşulsuz çalışmasının kaldırılması): Önceden `analysis-v2` (ağır
      // regex/kural tabanlı motor) HER istekte koşulsuz çalıştırılıyordu
      // — gerçek bir LLM sağlayıcısı yapılandırılmış olsa BİLE. Artık:
      //   1) BFC (Birim Fiyat Cetveli) doğrudan parser'ın çıktısından
      //      hesaplanır (`mergeBoqV2`) — analysis-v2'nin KENDİ regex BOQ
      //      okuması kaldırıldı, iki motor arası tutarsızlık riski
      //      ortadan kalktı (bkz. analysis-v2/boq.ts).
      //   2) `runAnalysisV2`'nin geri kalanı (risk/operasyon regex
      //      analizi) SADECE gerçek bir LLM sonucu YOKSA (mock/atlanan/
      //      başarısız) `ensureV2Result()` ile LAZY çalıştırılır — bkz.
      //      aşağıdaki kullanım noktaları.
      const officialBoqItems = mergeBoqV2(pipelineResult.llmPrep.officialBoqItems);

      const runV2Fallback = (): Promise<AnalysisV2Output> =>
        runAnalysisV2({
          tenderTitle: tender.title,
          companyId,
          tenderId: tender.id,
          administrativeText: administrativeText.trim() || null,
          technicalText: technicalText.trim() || null,
          ruleBasedSections: pipelineResult.sections,
          parserBoqItems: pipelineResult.llmPrep.officialBoqItems,
        });

      // Bu route /analysis/run ile AYNI kuralı izler: gerçek bir LLM
      // sağlayıcısı varsa o çağrılır; yoksa/başarısız olursa açıkça
      // 'skipped_mock' veya 'failed' olarak işaretlenir ve regex çıktısı
      // yalnızca ayrı, açıkça etiketlenmiş bir 'ruleBasedPreview'
      // section'ı olarak saklanır.
      const provider = getLLMProvider();
      let llmStatus: AnalysisRun["llmStatus"] = "not_attempted";
      let llmErrorMessage: string | null = null;
      let llmSection: TenderAnalysis | null = null;
      let ruleBasedPreviewSection: TenderAnalysis | null = null;
      let llmUsageInfo: { provider: string; model: string | null; inputTokens: number; outputTokens: number; estimatedCostUsd: number } | null = null;
      // SADECE gerçek bir LLM sonucu YOKSA (mock/atlanan/başarısız)
      // dolar — bkz. aşağıdaki üç atama noktası. Doğrudan atama (closure
      // içinden DEĞİL) TypeScript'in kontrol akışı analizinin bu değişkeni
      // doğru şekilde `AnalysisV2Output | null` olarak izlemesini sağlar.
      let v2Result: AnalysisV2Output | null = null;

      // KÖK NEDEN DÜZELTMESİ (Vision LLM): pipelineResult.llmPrep.llmReady
      // SADECE metin varlığına bakar (bkz. parser/pipeline.ts) — görsel-
      // sadece (taranmış/vision) dokümanlarda metin hiç olmayabilir, bu
      // durumda eski kod LLM adımını hiç ÇALIŞTIRMAZDI (tam olarak bu
      // sprint'in çözmeye çalıştığı senaryo). Artık görüntü varlığı da
      // "LLM'e hazır" sayılır.
      const llmReadyForVision = pipelineResult.llmPrep.llmReady || hasAnyImages || !!zeyilnameText.trim();

      if (!llmReadyForVision) {
        llmStatus = "not_attempted";
        v2Result = await runV2Fallback();
      } else if (provider.name === "mock") {
        llmStatus = "skipped_mock";
        llmErrorMessage = "LLM_PROVIDER=mock veya API anahtarı tanımsız — gerçek yapay zeka analizi çalıştırılmadı.";
        v2Result = await runV2Fallback();
        ruleBasedPreviewSection = {
          ...(v2Result.section as unknown as Record<string, unknown>),
          id: "ruleBasedPreview",
          source: "rule_based",
        } as unknown as TenderAnalysis;
      } else {
        try {
          const llmData = await runLlmAnalysis(provider, {
            tenderTitle: tender.title,
            ruleBasedSections: pipelineResult.sections,
            rawAdministrativeText: pipelineResult.llmPrep.rawAdministrativeText,
            rawTechnicalText: pipelineResult.llmPrep.rawTechnicalText,
            zeyilnameText: zeyilnameText.trim() || null,
            parserBoqItems: pipelineResult.llmPrep.officialBoqItems,
            documentImages: [
              ...administrativeImages,
              ...technicalImages,
              ...zeyilnameImages,
            ].map((img) => ({
              fileName: img.fileName,
              documentType: img.documentType,
              pages: img.pages,
              totalPdfPages: img.totalPdfPages,
            })),
          });
          llmSection = {
            id: "llmAnalysis",
            tenderId: tender.id,
            companyId,
            source: "llm",
            data: llmData,
            generatedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as TenderAnalysis;
          llmStatus = "completed";
          const usage = (llmData as any)?.usage;
          if (usage) {
            llmUsageInfo = {
              provider: usage.provider || provider.name,
              model: usage.model || null,
              inputTokens: Number(usage.inputTokens || 0),
              outputTokens: Number(usage.outputTokens || 0),
              estimatedCostUsd: Number(usage.estimatedCostUsd || 0),
            };
          }
        } catch (err) {
          llmStatus = "failed";
          llmErrorMessage = err instanceof Error ? err.message : "Bilinmeyen LLM hatası";
          console.error(
            `[llm] Doküman tabanlı analiz LLM adımı BAŞARISIZ oldu (tenderId=${tender.id}, provider=${provider.name}):`,
            llmErrorMessage,
          );
          // LLM başarısız oldu — "kaç bölüm bulundu" göstergesi için
          // regex tabanlı fallback'e (v2Result.sectionsFoundBoost) düş.
          v2Result = await runV2Fallback();
        }
      }

      const batch = adminDb.batch();

      for (const section of pipelineResult.sections) {
        const sectionRef = ref.collection("analysis").doc(section.section);
        const doc: TenderAnalysis = {
          id: section.section,
          tenderId: tender.id,
          companyId,
          source: "rule_based",
          data: section.data,
          generatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as TenderAnalysis;
        batch.set(sectionRef, doc);
      }

      if (llmSection) {
        batch.set(ref.collection("analysis").doc("llmAnalysis"), llmSection);
      } else {
        // Gerçek bir LLM sonucu YOKSA (skipped_mock/failed/not_attempted),
        // önceki bir çalıştırmadan kalmış olabilecek 'llmAnalysis' section'ı
        // silinir — eski/gerçek bir sonucun yeni (LLM'siz) çalıştırmanın
        // sonucuymuş gibi ekranda kalması engellenir.
        batch.delete(ref.collection("analysis").doc("llmAnalysis"));
      }
      if (ruleBasedPreviewSection) {
        batch.set(ref.collection("analysis").doc("ruleBasedPreview"), ruleBasedPreviewSection);
      }

      // Resmi Birim Fiyat Cetveli: cetvel ayrı dosyada, idari/teknik
      // şartname içinde veya ek belgede olabilir. LLM'e bağımlı değildir;
      // parser satırları sıra no + iş kalemi + birim + miktar güveniyle
      // çıkarır (officialBoqItems yukarıda, tek kaynaktan hesaplandı).
      const existingParserItemsSnap = await ref
        .collection("items")
        .where("source", "==", "parser")
        .get();
      for (const doc of existingParserItemsSnap.docs) batch.delete(doc.ref);

      // KÖK NEDEN DÜZELTMESİ (kritik bug — kullanıcı raporu: "BFC hâlâ
      // gelmiyor"): `officialBoqItems` REGEX/METİN tabanlı bir motordan
      // gelir — taranmış/görsel (Vision) bir dokümanda METİN hiç yoktur,
      // bu yüzden regex motoru HİÇBİR ZAMAN satır bulamaz, "Kalemler"
      // sekmesi kalıcı olarak boş kalırdı; LLM'in Vision ile okuduğu
      // (birimFiyatCetveli) satırlar hiçbir yere BAĞLANMIYORDU. Kullanıcı
      // talebi başından beri açıktı: "otomatik cetvel oluşmalı" — manuel
      // onay adımı OLMAYACAK. Artık: regex hiçbir satır bulamazsa VE
      // LLM'in kendi okuması satır içeriyorsa, asıl/düzenlenebilir
      // "Kalemler" tablosu OTOMATİK olarak LLM'in okumasından doldurulur.
      const existingAiItemsSnap = await ref
        .collection("items")
        .where("source", "==", "ai_approved")
        .get();
      for (const doc of existingAiItemsSnap.docs) batch.delete(doc.ref);

      const llmBoqRows = (llmSection?.data as { birimFiyatCetveli?: LlmBoqKalemi[] } | null)?.birimFiyatCetveli ?? [];

      if (officialBoqItems.length === 0 && llmBoqRows.length > 0) {
        console.log(
          `[analysis] Regex/parser BFC bulamadı (muhtemelen taranmış/görsel doküman) — LLM'in Vision okuması (${llmBoqRows.length} satır) otomatik olarak Kalemler tablosuna aktarılıyor.`
        );
        let aiOrderNo = 1;
        for (const row of llmBoqRows) {
          const kalemAdi = row.kalemAdi?.trim();
          if (!kalemAdi || kalemAdi === NOT_DETECTED_MARKER) continue;

          const unit = row.birim?.value && row.birim.value !== NOT_DETECTED_MARKER ? row.birim.value.slice(0, 30) : "adet";
          const quantity = parseLlmNumericField(row.miktar?.value) ?? 1;
          const unitPrice = parseLlmNumericField(row.birimFiyat?.value) ?? 0;
          const parsedVat = parseLlmNumericField(row.kdvOrani?.value);
          const vatRate = parsedVat !== null && [0, 1, 10, 20].includes(parsedVat) ? parsedVat : 20;
          const total = Math.round(quantity * unitPrice * 100) / 100;
          const vatAmount = Math.round(total * (vatRate / 100) * 100) / 100;

          const itemRef = ref.collection("items").doc();
          const item: TenderItem = {
            id: itemRef.id,
            tenderId: tender.id,
            companyId,
            orderNo: aiOrderNo,
            description: kalemAdi.slice(0, 500),
            unit,
            quantity,
            unitPrice,
            vatRate,
            total,
            vatAmount,
            grandTotal: Math.round((total + vatAmount) * 100) / 100,
            source: "ai_approved",
            category: null,
            sourceType: "ai_bfc",
            parentOfficialItemName: null,
            shortNote: null,
            sourceDocument: null,
            sourceReference: row.kaynak?.value && row.kaynak.value !== NOT_DETECTED_MARKER ? row.kaynak.value.slice(0, 100) : null,
            confidence: row.guvenSeviyesi === "yüksek" ? 0.85 : row.guvenSeviyesi === "orta" ? 0.55 : 0.25,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          batch.set(itemRef, item);
          aiOrderNo += 1;
        }
      }

      officialBoqItems.forEach((boqItem, idx) => {
        const itemRef = ref.collection("items").doc();
        const item: TenderItem = {
          id: itemRef.id,
          tenderId: tender.id,
          companyId,
          orderNo: boqItem.orderNo || idx + 1,
          description: boqItem.name,
          unit: boqItem.unit ?? "adet",
          quantity: boqItem.quantity ?? 1,
          unitPrice: 0,
          vatRate: 20,
          total: 0,
          vatAmount: 0,
          grandTotal: 0,
          source: "parser",
          category: null,
          sourceType: "official_bill_of_quantities",
          parentOfficialItemName: null,
          shortNote: null,
          sourceDocument: boqItem.sourceDocument,
          sourceReference: null,
          confidence: boqItem.confidence,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        batch.set(itemRef, item);
      });

      // "Kaç bölüm bulundu" göstergesi: gerçek bir LLM analizi
      // tamamlandıysa boost DOĞRUDAN LLM'in kendi (aynı şekilli) sonucundan
      // hesaplanır — analysis-v2'yi (regex motoru) TEKRAR çalıştırmaya
      // gerek yoktur. Aksi halde (mock/atlanan/başarısız) yukarıda lazy
      // hesaplanmış v2Result fallback olarak kullanılır.
      const sectionsFoundBoost =
        llmStatus === "completed" && llmSection
          ? countSections(
              llmSection.data as NonNullable<TenderAnalysisLlmAnalysis["data"]>,
              officialBoqItems.length,
            )
          : (v2Result?.sectionsFoundBoost ?? 0);
      const sectionsFound =
        pipelineResult.sections.filter((s) => s.confidence === "found").length +
        sectionsFoundBoost;

      const run: AnalysisRun = {
        id: runRef.id,
        tenderId: tender.id,
        companyId,
        status: "completed",
        administrativeTextLength: administrativeText.length,
        technicalTextLength: technicalText.length,
        rawAdministrativeText: pipelineResult.llmPrep.rawAdministrativeText,
        rawTechnicalText: pipelineResult.llmPrep.rawTechnicalText,
        extractedFields: pipelineResult.llmPrep
          .extractedFields as AnalysisRun["extractedFields"],
        officialBoqItems,
        sectionsFound,
        sectionsTotal: pipelineResult.sections.length + 5,
        conflictCount: pipelineResult.conflictCount,
        llmReady: llmReadyForVision,
        llmStatus,
        llmErrorMessage,
        errorMessage: null,
        triggeredBy: session.uid,
        triggeredByName: profile.displayName,
        createdAt: new Date().toISOString(),
        ...(llmUsageInfo
          ? {
              provider: llmUsageInfo.provider,
              model: llmUsageInfo.model,
              inputTokens: llmUsageInfo.inputTokens,
              outputTokens: llmUsageInfo.outputTokens,
              totalTokens: llmUsageInfo.inputTokens + llmUsageInfo.outputTokens,
              estimatedCostUsd: llmUsageInfo.estimatedCostUsd,
            }
          : {}),
      } as AnalysisRun;

      // highRiskCount/genelRiskSkoru SADECE gerçek bir LLM sonucu (llmStatus
      // === 'completed', yani llmSection dolu) varsa Tender belgesine
      // denormalize edilir. v2Result.riskScore/highRiskCount regex tabanlı
      // bir tahmindir ve artık "resmi" risk verisi olarak asla yazılmaz —
      // aksi halde kullanıcı, gerçek AI çalışmadığı halde risk skoru
      // görmeye devam eder.
      const llmDataForRisk = llmSection?.data as
        | { riskler?: Array<{ seviye?: string }>; executiveSummary?: { genelRiskSkoru?: number } }
        | undefined;
      const riskUpdates: Record<string, unknown> = llmDataForRisk
        ? {
            highRiskCount: (llmDataForRisk.riskler ?? []).filter((r) => r.seviye === "yüksek").length,
            ...(typeof llmDataForRisk.executiveSummary?.genelRiskSkoru === "number"
              ? { genelRiskSkoru: llmDataForRisk.executiveSummary.genelRiskSkoru }
              : {}),
          }
        : {};

      batch.set(runRef, run);
      batch.update(ref, {
        hasAnalysis: true,
        conflictCount: pipelineResult.conflictCount,
        ...riskUpdates,
        status: "analysis_ready",
        updatedAt: new Date().toISOString(),
      });

      for (const item of extraction.extracted) {
        batch.update(ref.collection("documents").doc(item.documentId), {
          status: "completed",
          errorMessage: null,
          updatedAt: new Date().toISOString(),
        });
      }

      await batch.commit();

      await logActivity({
        companyId,
        tenderId: tender.id,
        type: "analysis_completed",
        message: `Dosyalardan metin çıkarıldı ve zengin analiz tamamlandı (${sectionsFound}/${pipelineResult.sections.length + 5} bölüm bulundu).`,
        metadata: {
          runId: runRef.id,
          source: "documents",
          extractedDocuments: extraction.extracted.map((doc) => ({
            fileName: doc.fileName,
            characterCount: doc.characterCount,
          })),
          issues: extraction.issues,
        },
        actor: { session, profile },
      });

      const [updatedAnalysisSnap, updatedItemsSnap, updatedDocumentsSnap] =
        await Promise.all([
          ref.collection("analysis").get(),
          ref.collection("items").orderBy("orderNo", "asc").get(),
          ref.collection("documents").orderBy("createdAt", "asc").get(),
        ]);

      return apiSuccess(
        {
          run,
          sections: updatedAnalysisSnap.docs.map(
            (d) => d.data() as TenderAnalysis,
          ),
          items: updatedItemsSnap.docs.map((d) => d.data() as TenderItem),
          documents: updatedDocumentsSnap.docs.map(
            (d) => d.data() as TenderDocument,
          ),
          extractionIssues: extraction.issues,
        },
        201,
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Bilinmeyen hata";
      await runRef.set({
        id: runRef.id,
        tenderId: tender.id,
        companyId,
        status: "failed",
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
        llmStatus: "not_attempted",
        llmErrorMessage: null,
        errorMessage,
        triggeredBy: session.uid,
        triggeredByName: profile.displayName,
        createdAt: new Date().toISOString(),
      } satisfies AnalysisRun);

      await ref.update({
        status: "documents_pending",
        updatedAt: new Date().toISOString(),
      });
      return apiError(
        500,
        "document_analysis_failed",
        `Doküman analizi başarısız oldu: ${errorMessage}`,
      );
    }
  },
);
