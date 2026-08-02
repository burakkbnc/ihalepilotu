import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from './Card';
import SectionHeader from './SectionHeader';

/**
 * Tüm bölüm kartlarının temel kapsayıcısı — Card + SectionHeader
 * primitive'lerinden kompoze edilir. `notFound` true ise kart hiç
 * render edilmez (boş alanlar ekranda yer kaplamasın kuralı korunur).
 */
export default function SectionCard({
  title,
  description,
  notFound,
  accessory,
  children
}: {
  title: string;
  description?: string;
  notFound?: boolean;
  accessory?: ReactNode;
  children: ReactNode;
}) {
  if (notFound) return null;
  return (
    <Card>
      <CardHeader>
        <SectionHeader title={title} description={description} />
        {accessory}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}
