// ============================================================
// LLM Provider Factory
//
// LLM_PROVIDER ortam değişkenine göre uygun provider'ı döner.
//
// Faz 4 itibarıyla AnthropicProvider GERÇEK bir API entegrasyonudur
// (ANTHROPIC_API_KEY tanımlıysa gerçek Claude API çağrısı yapılır).
// OpenAIProvider ve GeminiProvider henüz placeholder'dır — bu fazda
// kullanıcı talebi sadece Anthropic entegrasyonunu kapsar.
//
// ÖNEMLİ (kök neden düzeltmesi): Önceki sürümde seçilen provider modül
// seviyesinde (process boyunca) cache'leniyordu. Bu, şu senaryoda
// SESSİZCE YANLIŞ DAVRANIŞA yol açabiliyordu: dev server süreci
// LLM_PROVIDER=anthropic/ANTHROPIC_API_KEY ayarlanmadan ÖNCE başlatılmış
// veya .env.local değiştirilip sunucu tam olarak yeniden başlatılmamışsa,
// cachedProvider kalıcı olarak 'mock' instance'ında KİLİTLİ kalıyordu —
// bu da tam olarak kullanıcının bildirdiği belirtiye (env doğru ama LLM
// hiç çalışmıyor) yol açar. Artık her çağrıda env taze okunur; bir
// provider INSTANCE'I oluşturmak ucuzdur (gerçek maliyet olan API
// çağrısı yalnızca generateAnalysis() çağrıldığında oluşur), bu yüzden
// cache kaldırmanın performans maliyeti yoktur.
// ============================================================
import type { LLMProvider } from './provider';
import { MockLLMProvider } from './providers/mock';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { GeminiProvider } from './providers/gemini';

export type LLMProviderName = 'mock' | 'anthropic' | 'openai' | 'gemini';

/**
 * Aktif LLM provider'ını döner. Her çağrıda ortam değişkenleri TAZE
 * okunur (cache YOKTUR) — bkz. yukarıdaki kök neden düzeltmesi notu.
 */
export function getLLMProvider(): LLMProvider {
  const configured = (process.env.LLM_PROVIDER as LLMProviderName | undefined) ?? 'mock';
  return resolveProvider(configured);
}

function resolveProvider(name: LLMProviderName): LLMProvider {
  switch (name) {
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.warn('[llm] LLM_PROVIDER=anthropic ancak ANTHROPIC_API_KEY tanımlı değil. MockLLMProvider kullanılıyor.');
        return new MockLLMProvider();
      }
      return new AnthropicProvider(apiKey);
    }

    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.warn('[llm] LLM_PROVIDER=openai ancak OPENAI_API_KEY tanımlı değil. MockLLMProvider kullanılıyor.');
        return new MockLLMProvider();
      }
      console.warn('[llm] OpenAIProvider henüz aktif değil (Faz 4 kapsamı dışı). MockLLMProvider kullanılıyor.');
      void new OpenAIProvider(apiKey);
      return new MockLLMProvider();
    }

    case 'gemini': {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('[llm] LLM_PROVIDER=gemini ancak GEMINI_API_KEY tanımlı değil. MockLLMProvider kullanılıyor.');
        return new MockLLMProvider();
      }
      console.warn('[llm] GeminiProvider henüz aktif değil (Faz 4 kapsamı dışı). MockLLMProvider kullanılıyor.');
      void new GeminiProvider(apiKey);
      return new MockLLMProvider();
    }

    case 'mock':
    default:
      return new MockLLMProvider();
  }
}
