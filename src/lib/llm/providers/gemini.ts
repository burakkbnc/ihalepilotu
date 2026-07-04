// ============================================================
// GeminiProvider — Placeholder (Faz 4'te aktif edilmemiştir)
//
// GEMINI_API_KEY tanımlandığında ve getLLMProvider() 'gemini' seçtiğinde
// kullanılacaktır. GERÇEK API ÇAĞRISI YAPMAZ. Faz 4'te yalnızca
// AnthropicProvider gerçek entegrasyona sahiptir (kullanıcı talebi).
// ============================================================
import type { LLMAnalysisRequest, LLMAnalysisResult, LLMProvider } from '../provider';

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';

  constructor(private readonly apiKey: string) {}

  async generateAnalysis(_request: LLMAnalysisRequest): Promise<LLMAnalysisResult> {
    void this.apiKey;
    throw new Error(
      'GeminiProvider henüz aktif değil. LLM_PROVIDER=anthropic veya LLM_PROVIDER=mock kullanın.'
    );
  }
}
