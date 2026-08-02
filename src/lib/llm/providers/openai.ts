// ============================================================
// OpenAIProvider — Placeholder (Faz 4'te aktif edilmemiştir)
//
// OPENAI_API_KEY tanımlandığında ve getLLMProvider() 'openai' seçtiğinde
// kullanılacaktır. GERÇEK API ÇAĞRISI YAPMAZ. Faz 4'te yalnızca
// AnthropicProvider gerçek entegrasyona sahiptir (kullanıcı talebi).
// ============================================================
import type { LLMAnalysisRequest, LLMAnalysisResult, LLMProvider } from '../provider';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  constructor(private readonly apiKey: string) {}

  async generateAnalysis(_request: LLMAnalysisRequest): Promise<LLMAnalysisResult> {
    void this.apiKey;
    throw new Error(
      'OpenAIProvider henüz aktif değil. LLM_PROVIDER=anthropic veya LLM_PROVIDER=mock kullanın.'
    );
  }
}
