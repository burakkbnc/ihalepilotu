import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/session';

// Landing page yok — kullanıcı doğrudan oturum durumuna göre yönlendirilir.
export default async function RootPage() {
  const session = await getSessionContext();

  if (session) {
    redirect('/dashboard');
  }

  redirect('/login');
}
