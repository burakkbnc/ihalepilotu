import { formatDateTime } from '@/lib/tenders/format';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui/Badge';
import type { AnalysisRun } from '@/types/tender';

const STATUS_LABELS: Record<AnalysisRun['status'], string> = {
  completed: 'Tamamlandı',
  failed: 'Başarısız'
};

const STATUS_VARIANT: Record<AnalysisRun['status'], BadgeVariant> = {
  completed: 'success',
  failed: 'danger'
};

export default function AnalysisRunHistory({ runs }: { runs: AnalysisRun[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz analiz çalıştırılmadı.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tarih</TableHead>
          <TableHead>Durum</TableHead>
          <TableHead>Bölüm</TableHead>
          <TableHead>Çelişki</TableHead>
          <TableHead>AI Analizi</TableHead>
          <TableHead>Çalıştıran</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id}>
            <TableCell>{formatDateTime(run.createdAt)}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[run.status]}>{STATUS_LABELS[run.status]}</Badge>
            </TableCell>
            <TableCell>{run.status === 'completed' ? `${run.sectionsFound}/${run.sectionsTotal}` : '—'}</TableCell>
            <TableCell>
              {run.status === 'completed' && run.conflictCount > 0 ? (
                <Badge variant="danger">{run.conflictCount}</Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              {run.llmReady ? <span className="font-medium text-success-600">Hazır</span> : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>{run.triggeredByName}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
