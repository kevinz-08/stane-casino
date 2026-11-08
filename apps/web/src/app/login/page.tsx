import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = { title: 'Entrar · Casino' };

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <AuthForm mode="login" />
    </main>
  );
}
