import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'İhale Pilotu',
  description: 'İhale hazırlık sürecini saatlerden dakikalara indiren analiz platformu.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={inter.variable}>
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
