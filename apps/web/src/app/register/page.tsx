import { INITIAL_CHIP_GRANT } from '@casino/shared';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { formatChips } from '@/lib/format';

export const metadata: Metadata = { title: 'Crear cuenta · Casino' };

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-semibold">Crear cuenta</h1>
      <p className="mt-2 text-sm opacity-70">
        Recibes {formatChips(INITIAL_CHIP_GRANT.toString())} fichas virtuales al registrarte. Sin
        dinero real.
      </p>
      <AuthForm mode="register" />
    </main>
  );
}
