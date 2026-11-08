'use client';

import type { BlackjackActionType, HandResult } from '@casino/game-engine';
import { BLACKJACK_MAX_BET, BLACKJACK_MIN_BET } from '@casino/shared';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayingCard } from '@/components/playing-card';
import {
  ApiError,
  type BlackjackRound,
  blackjackAction,
  getActiveBlackjack,
  getBlackjackRound,
  startBlackjack,
} from '@/lib/api';
import { formatChips } from '@/lib/format';
import { useSessionStore } from '@/stores/session.store';

const ACTION_LABEL: Record<Exclude<BlackjackActionType, 'INSURANCE'>, string> = {
  HIT: 'Pedir',
  STAND: 'Plantarse',
  DOUBLE: 'Doblar',
  SPLIT: 'Separar',
};

const RESULT_LABEL: Record<HandResult, string> = {
  BLACKJACK: '¡Blackjack!',
  WIN: 'Ganas',
  PUSH: 'Empate',
  LOSE: 'Pierdes',
};

const MESSAGES: Record<string, string> = {
  INSUFFICIENT_FUNDS: 'No tienes fichas suficientes.',
  ROUND_IN_PROGRESS: 'Ya tienes una ronda en curso.',
  BET_REJECTED: 'No puedes apostar ahora mismo.',
};

function errorText(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.body.code] ?? error.detail;
  return 'No se pudo conectar con el servidor.';
}

export default function BlackjackPage() {
  const status = useSessionStore((s) => s.status);
  const [round, setRound] = useState<BlackjackRound | null>(null);
  const [bet, setBet] = useState('20');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reused if the same "deal" click has to be retried, so the bet is never placed twice.
  const dealKey = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    void getActiveBlackjack()
      .then((active) => active && setRound(active))
      .catch(() => undefined);
  }, [status]);

  const run = useCallback(async (fn: () => Promise<BlackjackRound>) => {
    setPending(true);
    setError(null);
    try {
      setRound(await fn());
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  async function deal() {
    dealKey.current ??= crypto.randomUUID();
    const ok = await run(() => startBlackjack(bet, dealKey.current as string));
    if (ok) dealKey.current = null;
  }

  async function act(action: BlackjackActionType, take?: boolean) {
    if (!round) return;
    const current = round;
    const ok = await run(() =>
      blackjackAction(current.round.id, { action, version: current.view.version, take }),
    );
    // Someone (another tab, a double click) moved the round on: show its real state.
    if (!ok)
      void getBlackjackRound(current.round.id)
        .then(setRound)
        .catch(() => undefined);
  }

  if (status === 'unknown') return <main className="mx-auto max-w-3xl p-8 opacity-50">…</main>;
  if (status === 'anonymous') {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold">Blackjack</h1>
        <p className="mt-4">
          <Link href="/login" className="underline">
            Entra
          </Link>{' '}
          para jugar.
        </p>
      </main>
    );
  }

  const view = round?.view;
  const settled = !view || view.phase === 'SETTLED';
  const net = view?.payout != null ? BigInt(view.payout) - BigInt(view.totalBet) : null;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Blackjack</h1>
        <p className="text-xs opacity-60">
          6 mazos · el crupier se planta con 17 blando · blackjack paga 3:2
        </p>
      </div>

      <section className="mt-6 rounded-xl bg-emerald-950/60 p-6 ring-1 ring-emerald-800/50">
        <div>
          <h2 className="text-sm uppercase tracking-wide opacity-60">
            Crupier {view?.dealer.total != null && <span>· {view.dealer.total}</span>}
          </h2>
          <div className="mt-2 flex min-h-24 gap-2">
            {view?.dealer.cards.map((c, i) => (
              <PlayingCard key={i} card={c} />
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-6">
          {view?.hands.map((hand, i) => (
            <div
              key={i}
              className={`rounded-lg p-2 ${!settled && view.activeHand === i && view.phase === 'PLAYER' ? 'ring-2 ring-amber-400' : ''}`}
            >
              <h2 className="text-sm uppercase tracking-wide opacity-60">
                {view.hands.length > 1 ? `Mano ${i + 1}` : 'Tú'} · {hand.soft ? 'blando ' : ''}
                {hand.total} · {formatChips(hand.bet)} fichas{hand.doubled ? ' (doblada)' : ''}
              </h2>
              <div className="mt-2 flex gap-2">
                {hand.cards.map((c, j) => (
                  <PlayingCard key={j} card={c} />
                ))}
              </div>
              {hand.result && (
                <p className="mt-2 text-sm font-semibold" data-testid={`hand-result-${i}`}>
                  {RESULT_LABEL[hand.result]}
                  {hand.payout && hand.payout !== '0' && ` · +${formatChips(hand.payout)}`}
                </p>
              )}
            </div>
          ))}
        </div>

        {view?.phase === 'SETTLED' && net !== null && (
          <p className="mt-6 text-lg font-semibold" role="status">
            {net > 0n
              ? `Ganas ${formatChips(net.toString())} fichas`
              : net < 0n
                ? `Pierdes ${formatChips((-net).toString())} fichas`
                : 'Recuperas tu apuesta'}
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <section className="mt-6 flex flex-wrap items-end gap-3">
        {settled ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              Apuesta (par, {BLACKJACK_MIN_BET.toString()}–{BLACKJACK_MAX_BET.toString()})
              <input
                type="number"
                min={Number(BLACKJACK_MIN_BET)}
                max={Number(BLACKJACK_MAX_BET)}
                step={2}
                value={bet}
                onChange={(e) => {
                  setBet(e.target.value);
                  dealKey.current = null;
                }}
                className="w-32 rounded border border-white/15 bg-white/5 px-3 py-2"
              />
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() => void deal()}
              className="rounded bg-emerald-600 px-5 py-2 font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              Repartir
            </button>
          </>
        ) : view.phase === 'INSURANCE' ? (
          <>
            <span className="text-sm">
              El crupier muestra un as. ¿Seguro por la mitad de tu apuesta?
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => void act('INSURANCE', true)}
              className="rounded bg-white/10 px-4 py-2 hover:bg-white/20 disabled:opacity-50"
            >
              Tomar seguro
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void act('INSURANCE', false)}
              className="rounded bg-white/10 px-4 py-2 hover:bg-white/20 disabled:opacity-50"
            >
              Sin seguro
            </button>
          </>
        ) : (
          view.allowedActions
            .filter((a): a is Exclude<BlackjackActionType, 'INSURANCE'> => a !== 'INSURANCE')
            .map((a) => (
              <button
                key={a}
                type="button"
                disabled={pending}
                onClick={() => void act(a)}
                className="rounded bg-white/10 px-4 py-2 font-medium hover:bg-white/20 disabled:opacity-50"
              >
                {ACTION_LABEL[a]}
              </button>
            ))
        )}
      </section>

      {round && (
        <section className="mt-8 rounded border border-white/10 p-4 text-xs opacity-80">
          <h2 className="mb-2 text-sm font-semibold opacity-100">Juego verificable</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
            <dt className="font-sans opacity-60">Hash del server seed</dt>
            <dd className="break-all">{round.fairness.serverSeedHash}</dd>
            <dt className="font-sans opacity-60">Client seed</dt>
            <dd>{round.fairness.clientSeed}</dd>
            <dt className="font-sans opacity-60">Nonce</dt>
            <dd>{round.fairness.nonce}</dd>
          </dl>
          <p className="mt-2">
            Cuando rotes el seed podrás verificar esta ronda en{' '}
            <Link href="/fairness" className="underline">
              Juego justo
            </Link>
            .
          </p>
        </section>
      )}
    </main>
  );
}
