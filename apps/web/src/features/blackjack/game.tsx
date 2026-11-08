'use client';

import type { BlackjackActionType } from '@casino/game-engine';
import { BLACKJACK_MAX_BET, BLACKJACK_MIN_BET } from '@casino/shared';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BETTING_CHIPS, Chip } from '@/components/chips/chip';
import { ChipStack } from '@/components/chips/chip-stack';
import {
  ApiError,
  type BlackjackRound,
  blackjackAction,
  getActiveBlackjack,
  getBlackjackRound,
  startBlackjack,
} from '@/lib/api';
import { formatChips } from '@/lib/format';
import { playSound, warmUpAudio } from '@/lib/sound';
import { useSessionStore } from '@/stores/session.store';
import { speedFactor, useSettingsStore } from '@/stores/settings.store';
import { Dealer } from './dealer';
import { CARD_LANDED_MS, HOLE_LANDED_MS } from './pacing';
import { SettingsBar } from './settings-bar';
import {
  DealerRack,
  DiscardTray,
  FeltLettering,
  HandSpot,
  Shoe,
  TableSurface,
} from './table-parts';
import { TableCard } from './table-card';
import { TableContext } from './table-context';
import { useEventPlayer } from './use-event-player';
import { useLandedValue } from './use-landed-value';

type PlayAction = Exclude<BlackjackActionType, 'INSURANCE'>;

const ACTIONS: Array<{ action: PlayAction; label: string; key: string; className: string }> = [
  { action: 'HIT', label: 'Pedir', key: 'P', className: 'bg-emerald-600 hover:bg-emerald-500' },
  { action: 'STAND', label: 'Plantarse', key: 'S', className: 'bg-red-700 hover:bg-red-600' },
  { action: 'DOUBLE', label: 'Doblar', key: 'D', className: 'bg-amber-600 hover:bg-amber-500' },
  { action: 'SPLIT', label: 'Separar', key: 'E', className: 'bg-sky-700 hover:bg-sky-600' },
];

const MESSAGES: Record<string, string> = {
  INSUFFICIENT_FUNDS: 'No tienes fichas suficientes para esa apuesta.',
  ROUND_IN_PROGRESS: 'Ya tienes una ronda en curso.',
  BET_REJECTED: 'No puedes apostar ahora mismo.',
  ROUND_VERSION_MISMATCH: 'La mesa cambió en otra pestaña; la hemos actualizado.',
};

function errorText(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.body.code] ?? error.detail;
  return 'No se pudo conectar con el servidor.';
}

const MIN = Number(BLACKJACK_MIN_BET);
const MAX = Number(BLACKJACK_MAX_BET);

export function BlackjackGame() {
  const player = useEventPlayer();
  const { scene, dealer, animating, celebrations } = player;
  const speed = useSettingsStore((s) => s.speed);
  const sound = useSettingsStore((s) => s.sound);
  const volume = useSettingsStore((s) => s.volume);
  const showDealer = useSettingsStore((s) => s.showDealer);
  const factor = speedFactor(speed);

  const [round, setRound] = useState<BlackjackRound | null>(null);
  const [bet, setBet] = useState(0);
  const [lastBet, setLastBet] = useState(20);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gestureKey, setGestureKey] = useState(0);
  const dealKey = useRef<string | null>(null);

  const shoe = useRef<HTMLDivElement>(null);
  const tray = useRef<HTMLDivElement>(null);
  const anchors = useMemo(() => ({ shoe, dealerTray: tray, speed: factor }), [factor]);

  useEffect(() => useSettingsStore.getState().hydrate(), []);
  useEffect(() => {
    if (sound) warmUpAudio();
  }, [sound]);

  // Resume a round left open (reload, other tab): shown as it is, without animation.
  useEffect(() => {
    void getActiveBlackjack()
      .then((active) => {
        if (!active) return;
        setRound(active);
        player.show(active);
      })
      .catch(() => undefined);
  }, []);

  // The dealer re-plays a gesture on every step.
  useEffect(() => setGestureKey((k) => k + 1), [dealer]);

  // The header balance only changes once the table has shown the outcome.
  useEffect(() => {
    if (!animating && round) useSessionStore.getState().setBalance(round.balance);
  }, [animating, round]);

  // Confetti for a blackjack.
  useEffect(() => {
    if (celebrations === 0) return;
    void import('canvas-confetti').then(({ default: confetti }) =>
      confetti({
        particleCount: 140,
        spread: 75,
        origin: { y: 0.65 },
        colors: ['#d4af37', '#f1d77a', '#ffffff', '#15803d'],
        disableForReducedMotion: true,
      }),
    );
  }, [celebrations]);

  const settled = !scene || scene.phase === 'SETTLED';
  const betting = settled && !animating;
  const busy = pending || animating;

  const run = useCallback(
    async (request: () => Promise<BlackjackRound>, onConflict?: () => Promise<BlackjackRound>) => {
      setPending(true);
      setError(null);
      try {
        const next = await request();
        setRound(next);
        player.show(next, { animate: true });
        return true;
      } catch (e) {
        setError(errorText(e));
        if (onConflict && e instanceof ApiError && e.status === 409) {
          const fresh = await onConflict().catch(() => null);
          if (fresh) {
            setRound(fresh);
            player.show(fresh);
          }
        }
        return false;
      } finally {
        setPending(false);
      }
    },
    [player],
  );

  const deal = useCallback(async () => {
    if (busy || !betting) return;
    const amount = bet || lastBet;
    if (amount < MIN) return setError(`La apuesta mínima es ${MIN} fichas.`);
    dealKey.current ??= crypto.randomUUID();
    const ok = await run(() => startBlackjack(String(amount), dealKey.current as string));
    if (ok) {
      dealKey.current = null;
      setLastBet(amount);
      setBet(0);
    }
  }, [bet, betting, busy, lastBet, run]);

  const act = useCallback(
    async (action: BlackjackActionType, take?: boolean) => {
      if (!round || busy || !scene?.allowedActions.includes(action)) return;
      const current = round;
      await run(
        () => blackjackAction(current.round.id, { action, take, version: current.view.version }),
        () => getBlackjackRound(current.round.id),
      );
    },
    [busy, round, run, scene],
  );

  const addChip = (value: number) => {
    if (!betting) return;
    setError(null);
    setBet((b) => {
      const next = Math.min(MAX, b + value);
      if (next !== b && sound) playSound('chip', volume);
      return next;
    });
    dealKey.current = null;
  };

  // Keyboard: P pedir, S plantarse, D doblar, E separar, espacio repartir, Esc saltar animación.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key === 'Escape' && animating) return player.skip();
      if (animating || pending) return;
      const key = e.key.toUpperCase();
      if ((key === ' ' || key === 'ENTER') && betting) {
        e.preventDefault();
        void deal();
        return;
      }
      if (scene?.phase === 'INSURANCE') {
        if (key === 'Y') void act('INSURANCE', true);
        if (key === 'N') void act('INSURANCE', false);
        return;
      }
      const match = ACTIONS.find((a) => a.key === key);
      if (match) void act(match.action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, animating, betting, deal, pending, player, scene]);

  const outcome = useMemo(() => {
    if (!scene || scene.phase !== 'SETTLED' || animating || scene.payout === null) return null;
    const net = BigInt(scene.payout) - BigInt(scene.totalBet);
    if (scene.hands.some((h) => h.result === 'BLACKJACK'))
      return { text: '¡Blackjack!', tone: 'win' as const, net };
    if (net > 0n)
      return { text: `Ganas ${formatChips(net.toString())}`, tone: 'win' as const, net };
    if (net < 0n)
      return { text: `Pierdes ${formatChips((-net).toString())}`, tone: 'lose' as const, net };
    return { text: 'Empate', tone: 'push' as const, net };
  }, [animating, scene]);

  // Labels wait until the card they describe has landed and turned over.
  const landingMs = animating ? CARD_LANDED_MS * factor : 0;
  const dealerTotal = useLandedValue(
    scene && scene.dealer.cards.length > 0 ? (scene.dealer.total ?? 0) : null,
    animating ? Math.max(CARD_LANDED_MS, HOLE_LANDED_MS) * factor : 0,
  );

  return (
    <MotionConfig reducedMotion="user">
      <TableContext.Provider value={anchors}>
        {/* On desktop the game fills exactly the window below the header. */}
        <div className="mx-auto flex max-w-6xl flex-col px-2 pb-6 sm:px-6 lg:h-[calc(100dvh-61px)] lg:pb-2">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 lg:py-1.5">
            <h1 className="font-display text-2xl font-bold text-brass-light sm:text-3xl">
              Blackjack
            </h1>
            <SettingsBar />
          </div>

          <div
            className="relative lg:min-h-0 lg:flex-1"
            data-testid="table"
            data-round-id={round?.round.id ?? ''}
            data-phase={scene?.phase ?? 'IDLE'}
            data-animating={animating ? 'true' : 'false'}
            data-busy={busy ? 'true' : 'false'}
            data-version={round ? `${round.round.id}:${round.view.version}` : ''}
          >
            <TableSurface onClick={animating ? player.skip : undefined}>
              {/* dealer row */}
              <div className="grid shrink-0 grid-cols-[auto_1fr_auto] items-start gap-2">
                <DiscardTray ref={tray} />
                <div className="flex flex-col items-center">
                  {showDealer && (
                    <Dealer reaction={dealer} gestureKey={gestureKey} speed={factor} />
                  )}
                  <DealerRack />
                  <div className="mt-1 flex h-7 items-center gap-2 text-sm font-semibold text-cream">
                    {dealerTotal !== null && (
                      <span
                        className="rounded-full bg-black/45 px-2 py-0.5 tabular-nums"
                        data-testid="dealer-total"
                      >
                        Crupier · {dealerTotal}
                        {dealerTotal > 21 && ' · se pasa'}
                      </span>
                    )}
                    {scene?.insurance.bet && (
                      <span className="rounded-full bg-black/45 px-2 py-0.5">
                        Seguro {formatChips(scene.insurance.bet)}
                      </span>
                    )}
                  </div>
                  <div
                    className="flex min-h-[var(--card-h)] items-start"
                    data-testid="dealer-cards"
                  >
                    {scene?.dealer.cards.map((card, i) => (
                      <TableCard key={card.key} card={card} index={i} />
                    ))}
                  </div>
                </div>
                <Shoe ref={shoe} />
              </div>

              <FeltLettering />

              {/* player row: takes the remaining height and sits at the bottom of the felt */}
              <div className="relative flex flex-1 flex-wrap items-end justify-center gap-x-6 gap-y-2">
                {scene &&
                  scene.hands.map((hand, i) => (
                    <HandSpot
                      key={i}
                      hand={hand}
                      index={i}
                      active={
                        !betting &&
                        !settled &&
                        scene.phase === 'PLAYER' &&
                        scene.activeHand === i &&
                        scene.hands.length > 1
                      }
                      settled={betting || scene.phase === 'SETTLED'}
                      multiple={scene.hands.length > 1}
                      speed={factor}
                      landingMs={landingMs}
                    />
                  ))}
                {betting && <BetCircle amount={bet} />}
              </div>

              <AnimatePresence>
                {outcome && (
                  <motion.div
                    key={outcome.text}
                    initial={{ scale: 0.4, opacity: 0, y: '-50%', x: '-50%' }}
                    animate={{ scale: 1, opacity: 1, y: '-50%', x: '-50%' }}
                    exit={{ opacity: 0, x: '-50%', y: '-50%' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                    className={`pointer-events-none absolute left-1/2 top-[62%] z-20 whitespace-nowrap rounded-full px-7 py-2.5 font-display text-2xl font-bold shadow-2xl sm:text-3xl ${
                      outcome.tone === 'win'
                        ? 'bg-brass text-slate-950'
                        : outcome.tone === 'lose'
                          ? 'bg-slate-950/85 text-red-300'
                          : 'bg-slate-950/85 text-cream'
                    }`}
                    data-testid="outcome"
                  >
                    {outcome.text}
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <p
                  role="alert"
                  className="absolute inset-x-0 top-3 z-30 mx-auto w-fit max-w-[90%] rounded-lg bg-red-950/90 px-4 py-2 text-sm text-red-200 shadow-xl"
                >
                  {error}
                </p>
              )}

              {animating && (
                <p className="pointer-events-none absolute bottom-2 right-6 text-xs text-cream/50">
                  Clic para saltar
                </p>
              )}
            </TableSurface>
          </div>

          {/* controls */}
          <div className="shrink-0 pt-3 lg:pt-2">
            {betting ? (
              <div className="flex flex-col items-center gap-3 lg:flex-row lg:justify-center lg:gap-6">
                <div
                  className="flex flex-wrap justify-center gap-2"
                  role="group"
                  aria-label="Fichas"
                >
                  {BETTING_CHIPS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => addChip(value)}
                      disabled={bet + value > MAX}
                      className="rounded-full transition hover:-translate-y-1 focus:outline-none focus-visible:ring-4 focus-visible:ring-brass disabled:opacity-40"
                      aria-label={`Añadir ficha de ${value}`}
                    >
                      <Chip value={value} size={50} />
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <ControlButton onClick={() => setBet(0)} disabled={bet === 0}>
                    Borrar
                  </ControlButton>
                  <ControlButton onClick={() => setBet(lastBet)} disabled={bet === lastBet}>
                    Repetir {formatChips(String(lastBet))}
                  </ControlButton>
                  <ControlButton onClick={() => setBet((b) => Math.min(MAX, (b || lastBet) * 2))}>
                    ×2
                  </ControlButton>
                  <button
                    type="button"
                    onClick={() => void deal()}
                    disabled={pending}
                    className="rounded-full bg-brass px-8 py-3 font-display text-lg font-bold text-slate-950 shadow-lg transition hover:bg-brass-light disabled:opacity-50"
                    data-testid="deal"
                    title={`Apuesta entre ${MIN} y ${MAX} · espacio para repartir`}
                  >
                    Repartir {formatChips(String(bet || lastBet))}
                  </button>
                </div>
              </div>
            ) : scene?.phase === 'INSURANCE' && !animating ? (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <span className="text-sm text-cream">
                  El crupier muestra un as. ¿Seguro por la mitad de tu apuesta?
                </span>
                <ControlButton onClick={() => void act('INSURANCE', true)} disabled={busy}>
                  Tomar seguro (Y)
                </ControlButton>
                <ControlButton onClick={() => void act('INSURANCE', false)} disabled={busy}>
                  Sin seguro (N)
                </ControlButton>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-3">
                {ACTIONS.map(({ action, label, key, className }) => {
                  const allowed = !animating && !!scene?.allowedActions.includes(action);
                  return (
                    <button
                      key={action}
                      type="button"
                      onClick={() => void act(action)}
                      disabled={!allowed || busy}
                      className={`min-w-28 rounded-xl px-5 py-3 text-base font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-30 ${className}`}
                      data-testid={`action-${action}`}
                    >
                      {label} <span className="ml-1 text-xs opacity-70">{key}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* screen readers: what just happened */}
          <p className="sr-only" aria-live="polite">
            {dealer.line ?? ''} {outcome?.text ?? ''}
          </p>
        </div>

        {round && (
          <details className="mx-auto mb-8 max-w-6xl rounded border border-white/10 p-4 text-xs opacity-80 sm:mx-6 lg:mx-auto">
            <summary className="cursor-pointer text-sm font-semibold">Juego verificable</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
              <dt className="font-sans opacity-60">Hash del server seed</dt>
              <dd className="break-all">{round.fairness.serverSeedHash}</dd>
              <dt className="font-sans opacity-60">Client seed</dt>
              <dd>{round.fairness.clientSeed}</dd>
              <dt className="font-sans opacity-60">Nonce</dt>
              <dd>{round.fairness.nonce}</dd>
            </dl>
            <p className="mt-2">
              Al rotar el seed podrás verificar esta ronda en{' '}
              <Link href="/fairness" className="underline">
                Juego justo
              </Link>
              .
            </p>
          </details>
        )}
      </TableContext.Provider>
    </MotionConfig>
  );
}

function BetCircle({ amount }: { amount: number }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-brass/60 bg-black/10"
        data-testid="bet-circle"
      >
        {amount > 0 ? (
          <ChipStack amount={String(amount)} size={44} from={{ x: 0, y: 140 }} />
        ) : (
          <span className="text-center text-xs uppercase tracking-widest text-brass/70">
            Apuesta
          </span>
        )}
      </div>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-cream transition hover:bg-white/20 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
