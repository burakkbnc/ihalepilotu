import { Badge, type BadgeVariant } from './Badge';

export type DocumentSourceTone = 'administrative' | 'technical' | 'merged';

const SOURCE_LABELS: Record<DocumentSourceTone, string> = {
  administrative: 'İdari Şartname',
  technical: 'Teknik Şartname',
  merged: 'İdari + Teknik'
};

const SOURCE_VARIANT: Record<DocumentSourceTone, BadgeVariant> = {
  administrative: 'brand',
  technical: 'neutral',
  merged: 'neutral'
};

/** Bir alanın idari/teknik/birleşik şartnameden geldiğini gösteren rozet — Badge primitive'i üzerine kurulu. */
export default function SourceBadge({ source }: { source: DocumentSourceTone | null | undefined }) {
  if (!source) return null;
  return <Badge variant={SOURCE_VARIANT[source]} className="ml-2">{SOURCE_LABELS[source]}</Badge>;
}
