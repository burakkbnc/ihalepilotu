'use client';

import { useState } from 'react';
import { Bot, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

type AssistantSource = {
  type: 'ihale_analiz_sonucu' | 'sirket_belgeleri' | 'gecmis_ihaleler';
  title: string;
  detail?: string | null;
};

type Message = {
  role: 'user' | 'assistant';
  text: string;
  sources?: AssistantSource[];
  confidence?: 'low' | 'medium' | 'high';
};

const SOURCE_LABELS: Record<AssistantSource['type'], string> = {
  ihale_analiz_sonucu: 'İhale analiz sonucu',
  sirket_belgeleri: 'Şirket belgesi',
  gecmis_ihaleler: 'Geçmiş ihale'
};

const EXAMPLES = [
  'Bu ihaleye uygun iş deneyimimiz var mı?',
  'Bu ihale için hangi şirket belgeleri görünüyor?',
  'Teminatla ilgili analizde ne yazıyor?'
];

export default function TenderAssistantPanel({ tenderId }: { tenderId: string }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: 'Merhaba. Yüklediğiniz ihale dokümanları ve şirket kayıtları üzerinden sorularınızı yanıtlayabilirim. Örneğin iş deneyimi, teminat, eksik belge veya kritik tarihler hakkında soru sorabilirsiniz.'
    }
  ]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (rawQuestion?: string) => {
    const nextQuestion = (rawQuestion ?? question).trim();
    if (!nextQuestion || isSending) return;

    setQuestion('');
    setError(null);
    setIsSending(true);
    setMessages((current) => [...current, { role: 'user', text: nextQuestion }]);

    try {
      const res = await fetch(`/api/tenders/${tenderId}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: nextQuestion })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Asistan yanıt veremedi.');

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: body.data.answer,
          sources: body.data.sources ?? [],
          confidence: body.data.confidence
        }
      ]);
    } catch (err: any) {
      setError(err?.message || 'Asistan yanıt veremedi.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
      <div className="border-b border-border bg-surface-muted p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">
              <Bot size={14} strokeWidth={2.2} aria-hidden />
              İhale Asistanı V1
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">Belgelerinize dayalı ihale yardımcısı</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              İhale Asistanı, yüklediğiniz ihale dokümanları ve şirket kayıtlarınızı esas alarak sorularınızı yanıtlar. Tüm değerlendirmeler sistemde bulunan belgeler üzerinden yapılır. Harici kaynak kullanılmaz, varsayım veya kişisel yorum üretilmez. Yanıtlar mümkün olduğunca ilgili belge ve şartname maddeleriyle desteklenir.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5 md:p-6">
        <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed', message.role === 'user' ? 'bg-brand-600 text-white' : 'border border-border bg-white text-slate-800 shadow-sm')}>
                <p>{message.text}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-3 border-t border-border/70 pt-2 text-xs text-slate-500">
                    <p className="font-semibold text-slate-600">Kaynak</p>
                    <div className="mt-1 space-y-1">
                      {message.sources.map((source, sourceIndex) => (
                        <p key={`${source.title}-${sourceIndex}`}>
                          📄 {source.title || SOURCE_LABELS[source.type]}{source.detail ? ` · ${source.detail}` : ''}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => ask(example)} disabled={isSending} className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 disabled:opacity-50">
              {example}
            </button>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            ask();
          }}
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Örn: Bu ihaleye uygun iş deneyimimiz var mı?"
            className="min-w-0 flex-1 rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-100"
            maxLength={500}
          />
          <button type="submit" disabled={!question.trim() || isSending} className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-55">
            <Send size={15} strokeWidth={2.2} aria-hidden />
            Sor
          </button>
        </form>

        {error && <p className="rounded-xl border border-danger-100 bg-danger-50 px-4 py-2 text-sm text-danger-700">{error}</p>}
      </div>
    </div>
  );
}
