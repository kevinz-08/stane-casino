'use client';

import {
  type BlackjackVerification,
  canonicalShoe,
  commitServerSeed,
  createHmacRng,
  LazyShuffle,
  verifyBlackjackRound,
} from '@casino/game-engine';
import type { RoundSummaryDto, SeedsDto } from '@casino/shared';
import { CLIENT_SEED_PATTERN } from '@casino/shared';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { PlayingCard } from '@/components/playing-card';
import { ApiError, getBlackjackRound, getRounds, getSeeds, rotateSeeds } from '@/lib/api';
import { formatChips, formatDateTime } from '@/lib/format';
import { useSessionStore } from '@/stores/session.store';

type RoundCheck =
  | { roundId: string; status: 'pending' }
  | { roundId: string; status: 'not-revealed' }
  | { roundId: string; status: 'done'; result: BlackjackVerification }
  | { roundId: string; status: 'error'; message: string };

const input = 'w-full rounded border border-white/15 bg-white/5 px-3 py-2 font-mono text-sm';

export default function FairnessPage() {
  const status = useSessionStore((s) => s.status);
  const [seeds, setSeeds] = useState<SeedsDto | null>(null);
  const [rounds, setRounds] = useState<RoundSummaryDto[]>([]);
  const [newClientSeed, setNewClientSeed] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [check, setCheck] = useState<RoundCheck | null>(null);

  const reload = useCallback(async () => {
    const [s, r] = await Promise.all([getSeeds(), getRounds(null, 50)]);
    setSeeds(s);
    setRounds(r.rounds);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void reload().catch(() => undefined);
  }, [status, reload]);

  async function onRotate(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await rotateSeeds(newClientSeed.trim() || undefined);
      setNewClientSeed('');
      setMessage('Server seed revelado. Ya puedes verificar las rondas de ese par.');
      await reload();
    } catch (e) {
      setMessage(
        e instanceof ApiError && e.body.code === 'ROUND_IN_PROGRESS'
          ? 'Termina la ronda en curso antes de rotar: revelar el seed mostraría sus cartas.'
          : e instanceof ApiError
            ? e.detail
            : 'No se pudo rotar el seed.',
      );
    }
  }

  async function verify(roundId: string) {
    setCheck({ roundId, status: 'pending' });
    try {
      const round = await getBlackjackRound(roundId);
      if (!round.fairness.serverSeed) return setCheck({ roundId, status: 'not-revealed' });
      // Runs entirely in the browser: nothing here trusts the server's account of the round.
      const result = verifyBlackjackRound({
        serverSeed: round.fairness.serverSeed,
        serverSeedHash: round.fairness.serverSeedHash,
        clientSeed: round.fairness.clientSeed,
        nonce: round.fairness.nonce,
        events: round.events ?? [],
      });
      setCheck({ roundId, status: 'done', result });
    } catch {
      setCheck({ roundId, status: 'error', message: 'No se pudo cargar la ronda.' });
    }
  }

  if (status === 'anonymous') {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold">Juego justo</h1>
        <p className="mt-4">
          <Link href="/login" className="underline">
            Entra
          </Link>{' '}
          para ver tus seeds. El verificador manual de abajo funciona sin cuenta.
        </p>
        <ManualVerifier />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Juego justo</h1>
      <p className="mt-2 text-sm opacity-70">
        Antes de cada ronda ves el hash SHA-256 del server seed. Las cartas salen de
        HMAC-SHA256(server seed, &quot;client seed:nonce:cursor&quot;) y un barajado Fisher–Yates de
        6 mazos. Al rotar, el server seed se revela y puedes recalcular cada ronda aquí, en tu
        navegador, o con <code>node scripts/verify-fairness.mjs</code>.
      </p>

      {seeds && (
        <section className="mt-6 rounded border border-white/10 p-4">
          <h2 className="font-semibold">Par activo</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="opacity-60">Hash del server seed</dt>
            <dd className="break-all font-mono text-xs">{seeds.active.serverSeedHash}</dd>
            <dt className="opacity-60">Client seed</dt>
            <dd className="font-mono">{seeds.active.clientSeed}</dd>
            <dt className="opacity-60">Próximo nonce</dt>
            <dd className="font-mono">{seeds.active.nextNonce}</dd>
          </dl>
          <form onSubmit={onRotate} className="mt-4 flex flex-wrap items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Nuevo client seed (opcional)
              <input
                value={newClientSeed}
                onChange={(e) => setNewClientSeed(e.target.value)}
                pattern={CLIENT_SEED_PATTERN.source}
                maxLength={64}
                placeholder="aleatorio si lo dejas vacío"
                className={input}
              />
            </label>
            <button
              type="submit"
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
            >
              Rotar y revelar
            </button>
          </form>
          {message && <p className="mt-2 text-sm opacity-80">{message}</p>}
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-semibold">Tus rondas</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left opacity-60">
            <tr>
              <th className="py-2 font-normal">Fecha</th>
              <th className="py-2 font-normal">Nonce</th>
              <th className="py-2 text-right font-normal">Apostado</th>
              <th className="py-2 text-right font-normal">Devuelto</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.id} className="border-t border-white/5 align-top">
                <td className="py-2">{formatDateTime(r.createdAt)}</td>
                <td className="py-2 font-mono">{r.nonce}</td>
                <td className="py-2 text-right font-mono">{formatChips(r.totalBet)}</td>
                <td className="py-2 text-right font-mono">
                  {r.payout ? formatChips(r.payout) : '—'}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => void verify(r.id)}
                    className="underline"
                    disabled={r.status !== 'SETTLED'}
                  >
                    Verificar
                  </button>
                  {check?.roundId === r.id && <CheckResult check={check} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rounds.length === 0 && <p className="mt-2 text-sm opacity-60">Aún no has jugado.</p>}
      </section>

      {seeds && seeds.revealed.length > 0 && (
        <section className="mt-8">
          <h2 className="font-semibold">Pares revelados</h2>
          <ul className="mt-2 space-y-2 text-xs">
            {seeds.revealed.map((p) => (
              <li key={p.id} className="rounded border border-white/10 p-2 font-mono">
                <div>
                  server seed: <span className="break-all">{p.serverSeed}</span>
                </div>
                <div>
                  hash: <span className="break-all">{p.serverSeedHash}</span>
                </div>
                <div>
                  client seed: {p.clientSeed} · nonces 0–{Math.max(p.nextNonce - 1, 0)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ManualVerifier />
    </main>
  );
}

function CheckResult({ check }: { check: RoundCheck }) {
  if (check.status === 'pending') return <p className="mt-1 text-xs opacity-60">Verificando…</p>;
  if (check.status === 'error') return <p className="mt-1 text-xs text-red-300">{check.message}</p>;
  if (check.status === 'not-revealed') {
    return <p className="mt-1 text-xs opacity-80">Rota el seed para poder verificar esta ronda.</p>;
  }
  const { result } = check;
  return (
    <div
      className={`mt-1 text-left text-xs ${result.ok ? 'text-emerald-300' : 'text-red-300'}`}
      role="status"
    >
      <p>{result.commitmentValid ? '✓' : '✗'} el server seed coincide con el hash publicado</p>
      <p>{result.eventsReproduced ? '✓' : '✗'} el reparto recalculado reproduce la ronda</p>
      {result.mismatch && <p>Primera diferencia en el evento #{result.mismatch.seq}</p>}
    </div>
  );
}

/** Recomputes the commitment and the shoe order from seeds typed by the user. */
function ManualVerifier() {
  const [serverSeed, setServerSeed] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [nonce, setNonce] = useState('0');
  const valid = serverSeed !== '' && /^\d+$/.test(nonce);
  const cards = valid
    ? (() => {
        const shoe = new LazyShuffle(
          canonicalShoe(6),
          createHmacRng({ serverSeed, clientSeed, nonce: Number(nonce) }),
        );
        return Array.from({ length: 12 }, () => shoe.draw());
      })()
    : [];

  return (
    <section className="mt-10 rounded border border-white/10 p-4">
      <h2 className="font-semibold">Verificador manual</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input
          aria-label="Server seed"
          placeholder="server seed"
          value={serverSeed}
          onChange={(e) => setServerSeed(e.target.value)}
          className={input}
        />
        <input
          aria-label="Client seed"
          placeholder="client seed"
          value={clientSeed}
          onChange={(e) => setClientSeed(e.target.value)}
          className={input}
        />
        <input
          aria-label="Nonce"
          placeholder="nonce"
          value={nonce}
          onChange={(e) => setNonce(e.target.value)}
          className={input}
        />
      </div>
      {valid && (
        <>
          <p className="mt-3 break-all text-xs">
            SHA-256(server seed) = <span className="font-mono">{commitServerSeed(serverSeed)}</span>
          </p>
          <p className="mt-2 text-xs opacity-70">
            Orden de salida: jugador, crupier (vista), jugador, crupier (tapada), y luego cartas
            pedidas.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {cards.map((c, i) => (
              <PlayingCard key={i} card={c} small />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
