'use client';

import type { LedgerEntryDto, LedgerReasonDto } from '@casino/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, getHistory, loadBalance } from '@/lib/api';
import { formatChips, formatDateTime } from '@/lib/format';
import { useSessionStore } from '@/stores/session.store';

const REASONS: Record<LedgerReasonDto, string> = {
  INITIAL_GRANT: 'Fichas de bienvenida',
  BET: 'Apuesta',
  PAYOUT: 'Premio',
  REFUND: 'Devolución',
  ADJUSTMENT: 'Ajuste',
};

export default function AccountPage() {
  // TODO(fase-2): seed management (commit, rotate, verify)
  // TODO(fase-5): responsible gaming limits and self-exclusion
  const status = useSessionStore((s) => s.status);
  const user = useSessionStore((s) => s.user);
  const balance = useSessionStore((s) => s.balance);
  const [entries, setEntries] = useState<LedgerEntryDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (from: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const page = await getHistory(from);
      setEntries((prev) => (from ? [...prev, ...page.entries] : page.entries));
      setCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    void loadBalance().catch(() => undefined);
    void loadPage(null);
  }, [status, loadPage]);

  if (status === 'unknown') return <main className="mx-auto max-w-3xl p-8 opacity-50">…</main>;

  if (status === 'anonymous' || !user) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold">Cuenta</h1>
        <p className="mt-4">
          <Link href="/login" className="underline">
            Entra
          </Link>{' '}
          para ver tu saldo y tu historial.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Cuenta</h1>
      <p className="mt-1 text-sm opacity-70">
        {user.displayName} · {user.email}
      </p>

      <section className="mt-6 rounded border border-white/10 p-4">
        <h2 className="text-sm uppercase tracking-wide opacity-60">Saldo</h2>
        <p className="mt-1 font-mono text-3xl tabular-nums">{formatChips(balance)} fichas</p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Movimientos</h2>
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        <table className="mt-3 w-full text-sm">
          <thead className="text-left opacity-60">
            <tr>
              <th className="py-2 font-normal">Fecha</th>
              <th className="py-2 font-normal">Concepto</th>
              <th className="py-2 text-right font-normal">Importe</th>
              <th className="py-2 text-right font-normal">Saldo</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-white/5">
                <td className="py-2 font-sans">{formatDateTime(e.createdAt)}</td>
                <td className="py-2 font-sans">{REASONS[e.reason]}</td>
                <td
                  className={`py-2 text-right ${e.direction === 'CREDIT' ? 'text-emerald-400' : 'text-red-300'}`}
                >
                  {e.direction === 'CREDIT' ? '+' : '−'}
                  {formatChips(e.amount)}
                </td>
                <td className="py-2 text-right">{formatChips(e.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && entries.length === 0 && !error && (
          <p className="mt-3 text-sm opacity-60">Sin movimientos.</p>
        )}
        {cursor && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadPage(cursor)}
            className="mt-4 rounded border border-white/15 px-3 py-1 text-sm hover:bg-white/5 disabled:opacity-50"
          >
            {loading ? 'Cargando…' : 'Ver más'}
          </button>
        )}
      </section>
    </main>
  );
}
