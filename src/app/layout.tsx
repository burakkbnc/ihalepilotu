import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://ihalepilotu.com'),
  title: { default: 'İhale Pilotu | Akıllı İhale Analiz Platformu', template: '%s | İhale Pilotu' },
  description: 'İhale dokümanlarını analiz edin; kritik tarihleri, belgeleri, teminatları ve teknik gereklilikleri tek panelde yönetin.',
  openGraph: { title: 'İhale Pilotu', description: 'İhale dokümanlarını anlayın. Hazırlık sürecini yönetin.', type: 'website', locale: 'tr_TR' },
  robots: { index: true, follow: true }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="tr"><body className="min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased"><AuthProvider>{children}</AuthProvider></body></html>;
}
