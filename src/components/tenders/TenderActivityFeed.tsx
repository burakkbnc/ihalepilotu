import { Card, CardHeader, SectionHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/tenders/format';
import type { Activity } from '@/types/tender';

export default function TenderActivityFeed({ activities }: { activities: Activity[] }) {
  return (
    <Card>
      <CardHeader>
        <SectionHeader title="Aktivite Geçmişi" />
      </CardHeader>

      {activities.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">Henüz aktivite kaydı yok.</p>
      ) : (
        <ul className="divide-y divide-border px-5 pb-5">
          {activities.map((activity) => (
            <li key={activity.id} className="py-3">
              <p className="text-sm text-slate-700">{activity.message}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {activity.actorName} · {formatDateTime(activity.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
