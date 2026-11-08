'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { loadBalance, logout, refreshSession } from '@/lib/api';
import { AnimatedChips } from './animated-chips';
import { useSessionStore } from '@/stores/session.store';

/**
 * Restores the session from the refresh cookie on first load and shows the balance.
 * The balance shown is whatever the server last said; it is never computed client-side.
 */
export function SessionHeader() {
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const user = useSessionStore((s) => s.user);
  const balance = useSessionStore((s) => s.balance);

  useEffect(() => {
    if (useSessionStore.getState().status !== 'unknown') return;
    void refreshSession().then((auth) => (auth ? loadBalance() : undefined));
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && balance === null) void loadBalance().catch(() => undefined);
  }, [status, balance]);

  async function onLogout() {
    await logout();
    router.push('/login');
  }

  return (
    <header className="border-b border-white/10">
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-4">
        <Link href="/" className="font-semibold tracking-tight">
          Casino <span className="hidden text-xs opacity-60 sm:inline">fichas virtuales</span>
        </Link>

        {status === 'unknown' && <span className="text-sm opacity-50">…</span>}

        {status === 'anonymous' && (
          <div className="flex gap-3 text-sm">
            <Link href="/login" className="hover:underline">
              Entrar
            </Link>
            <Link
              href="/register"
              className="rounded bg-emerald-600 px-3 py-1 font-medium hover:bg-emerald-500"
            >
              Crear cuenta
            </Link>
          </div>
        )}

        {status === 'authenticated' && user && (
          <div className="flex items-center gap-3 text-sm sm:gap-4">
            <span
              className="whitespace-nowrap rounded bg-white/5 px-3 py-1 font-mono tabular-nums"
              aria-label="Saldo de fichas"
              data-testid="balance"
            >
              <AnimatedChips value={balance} /> fichas
            </span>
            <Link href="/account" className="hover:underline">
              {user.displayName}
            </Link>
            <button type="button" onClick={onLogout} className="opacity-70 hover:opacity-100">
              Salir
            </button>
          </div>
        )}
      </nav>
    </header>
  );
}
