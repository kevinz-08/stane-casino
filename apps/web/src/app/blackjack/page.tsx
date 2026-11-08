'use client';

import Link from 'next/link';
import { BlackjackGame } from '@/features/blackjack/game';
import { useSessionStore } from '@/stores/session.store';

export default function BlackjackPage() {
  const status = useSessionStore((s) => s.status);

  if (status === 'unknown') return <main className="mx-auto max-w-3xl p-8 opacity-50">…</main>;
  if (status === 'anonymous') {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="font-display text-3xl font-bold">Blackjack</h1>
        <p className="mt-4">
          <Link href="/login" className="underline">
            Entra
          </Link>{' '}
          para jugar.
        </p>
      </main>
    );
  }
  return (
    <main>
      <BlackjackGame />
    </main>
  );
}
