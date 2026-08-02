import { Badge } from '@/components/ui/Badge';
import { TENDER_STATUS_LABELS } from '@/lib/tenders/format';
import type { TenderStatus } from '@/types/tender';

const STATUS_VARIANT: Record<TenderStatus, 'neutral' | 'warning' | 'brand' | 'success' | 'outline'> = {
  draft: 'neutral',
  documents_pending: 'warning',
  processing: 'outline',
  analysis_ready: 'success',
  ready_for_bid: 'brand',
  archived: 'neutral'
};

export default function TenderStatusBadge({ status }: { status: TenderStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{TENDER_STATUS_LABELS[status]}</Badge>;
}
