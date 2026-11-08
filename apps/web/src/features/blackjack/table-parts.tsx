'use client';

import type { HandResult } from '@casino/game-engine';
import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, type ReactNode, useEffect, useState } from 'react';
import { CardBack } from '@/components/cards/card-art';
import { ChipStack } from '@/components/chips/chip-stack';
import { formatChips } from '@/lib/format';
import { PACING } from './pacing';
import type { SceneHand } from './scene';
import { TableCard } from './table-card';
import { useLandedValue } from './use-landed-value';

let feltTexture: string | null = null;

/**
 * Fine fibre noise for the felt, generated ONCE as a small bitmap (an SVG turbulence filter
 * would be re-rasterised on every repaint of the table). Cosmetic, so Math.random is fine.
 */
function useFeltTexture(): string | null {
  const [texture, setTexture] = useState(feltTexture);
  useEffect(() => {
    if (feltTexture) return;
    try {
      const size = 160;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = ctx.createImageData(size, size);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = Math.random() * 22;
      }
      ctx.putImageData(img, 0, 0);
      feltTexture = `url(${canvas.toDataURL('image/png')})`;
      setTexture(feltTexture);
    } catch {
      // no canvas: plain felt
    }
  }, []);
  return texture;
}

/**
 * The table: padded wooden rail around a felt surface with a spotlight. On large screens it
 * fills the height it is given (the whole game fits the window); elsewhere it grows with its
 * content. Card size is the `--card-h` CSS variable, derived from the viewport height on
 * desktop so the table never pushes the player's hand below the fold.
 */
export function TableSurface({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const noise = useFeltTexture();
  return (
    <div
      className="relative rounded-b-[50%_22%] rounded-t-3xl p-3 shadow-2xl sm:p-4 lg:h-full"
      style={{
        background: 'linear-gradient(180deg, var(--color-wood) 0%, var(--color-wood-dark) 100%)',
        boxShadow: 'inset 0 2px 0 rgb(255 255 255 / 0.12), 0 30px 60px rgb(0 0 0 / 0.55)',
      }}
    >
      <div
        onClick={onClick}
        className="relative flex flex-col overflow-hidden rounded-b-[50%_21%] rounded-t-2xl px-3 pb-10 pt-3 [--card-h:6.75rem] sm:px-8 sm:[--card-h:7.75rem] lg:h-full lg:pb-8 lg:[--card-h:clamp(5rem,15.5dvh,10rem)]"
        style={{
          backgroundColor: 'var(--color-felt)',
          backgroundImage: `${noise ? `${noise}, ` : ''}radial-gradient(ellipse at 50% 30%, var(--color-felt-light) 0%, var(--color-felt) 45%, var(--color-felt-dark) 100%)`,
          boxShadow: 'inset 0 0 0 2px rgb(212 175 55 / 0.35), inset 0 10px 40px rgb(0 0 0 / 0.45)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Rules printed on the felt, along an arc (sized by height on desktop). */
export function FeltLettering() {
  return (
    <svg
      viewBox="0 0 600 120"
      className="pointer-events-none mx-auto my-1 w-full max-w-xl shrink-0 select-none lg:h-[7.5dvh] lg:w-auto lg:max-w-none"
      aria-hidden
    >
      {/* Arcs ~45 units apart at the centre so the two lines never touch. */}
      <path id="felt-arc-1" d="M60 8 Q300 92 540 8" fill="none" />
      <path id="felt-arc-2" d="M10 42 Q300 152 590 42" fill="none" />
      <text
        fill="var(--color-brass)"
        fillOpacity="0.75"
        fontSize="26"
        fontWeight="700"
        letterSpacing="4"
        fontFamily="var(--font-playfair), serif"
      >
        <textPath href="#felt-arc-1" startOffset="50%" textAnchor="middle">
          BLACKJACK PAGA 3 A 2
        </textPath>
      </text>
      <text
        fill="var(--color-cream)"
        fillOpacity="0.45"
        fontSize="12"
        letterSpacing="2"
        fontFamily="var(--font-inter), sans-serif"
      >
        <textPath href="#felt-arc-2" startOffset="50%" textAnchor="middle">
          EL CRUPIER SE PLANTA EN TODOS LOS 17 · EL SEGURO PAGA 2 A 1
        </textPath>
      </text>
    </svg>
  );
}

/** The shoe the cards come out of (an animation anchor). */
export const Shoe = forwardRef<HTMLDivElement>(function Shoe(_props, ref) {
  return (
    <div
      ref={ref}
      className="relative mr-1 h-24 w-20 origin-top-right scale-[0.65] sm:mr-0 sm:h-28 sm:w-24 sm:scale-100"
      aria-hidden
    >
      <div className="absolute inset-x-1 bottom-1 top-4 -skew-x-6 rounded-md bg-gradient-to-b from-slate-800 to-slate-950 shadow-lg ring-1 ring-black/40" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute left-3 h-16 w-12 sm:h-20 sm:w-14"
          style={{ top: 2 + i * 2, transform: `rotate(${-14 + i}deg)` }}
        >
          <CardBack />
        </div>
      ))}
      <div className="absolute inset-x-0 bottom-0 h-8 rounded-b-md bg-gradient-to-b from-slate-700 to-slate-900 ring-1 ring-black/40" />
    </div>
  );
});

/** The house's chip tray in front of the dealer (it also hides where his torso ends). */
export function DealerRack() {
  const columns = ['#7c3aed', '#1f2937', '#15803d', '#dc2626', '#2563eb', '#ea580c', '#f5f5f4'];
  return (
    <div
      className="relative z-10 -mt-7 flex h-9 w-56 items-end justify-center gap-1 rounded-md px-2 pb-1 sm:w-64"
      style={{
        background: 'linear-gradient(180deg, #2a1a0e 0%, #1a0f07 100%)',
        boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.12), 0 6px 14px rgb(0 0 0 / 0.5)',
      }}
      aria-hidden
    >
      {columns.map((color) => (
        <div
          key={color}
          className="flex h-6 flex-1 flex-col justify-end gap-px overflow-hidden rounded-sm"
        >
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className="h-[3px] w-full rounded-[1px]"
              style={{ background: color, opacity: 0.85 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Where finished cards go (decorative) and where lost chips are collected. */
export const DiscardTray = forwardRef<HTMLDivElement>(function DiscardTray(_props, ref) {
  return (
    <div
      ref={ref}
      className="relative h-20 w-16 origin-top-left scale-75 opacity-80 sm:h-24 sm:w-20 sm:scale-100"
      aria-hidden
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="absolute h-16 w-12 sm:h-20 sm:w-14"
          style={{ top: 4 - i, left: 6 + i * 0.5, transform: `rotate(${8 - i * 3}deg)` }}
        >
          <CardBack />
        </div>
      ))}
    </div>
  );
});

const RESULT: Record<HandResult, { label: string; className: string }> = {
  BLACKJACK: { label: '¡Blackjack!', className: 'bg-brass text-slate-950' },
  WIN: { label: 'Ganas', className: 'bg-emerald-400 text-slate-950' },
  PUSH: { label: 'Empate', className: 'bg-slate-200 text-slate-900' },
  LOSE: { label: 'Pierdes', className: 'bg-red-500 text-white' },
};

/** One player hand: total and result on top; the chips on it beside the cards. */
export function HandSpot({
  hand,
  index,
  active,
  settled,
  multiple,
  speed,
  landingMs,
}: {
  hand: SceneHand;
  index: number;
  active: boolean;
  settled: boolean;
  multiple: boolean;
  speed: number;
  /** How long until a card dealt now has landed and turned (0 = not animating). */
  landingMs: number;
}) {
  const result = settled ? hand.result : null;
  const winnings = result && hand.payout ? BigInt(hand.payout) - BigInt(hand.bet) : 0n;
  const lost = result === 'LOSE';
  // The total (and the bust stamp) only update once the new card is visible.
  const total = useLandedValue(
    hand.soft && hand.total < 21 ? `${hand.total - 10}/${hand.total}` : String(hand.total),
    landingMs,
  );
  const busted = useLandedValue(hand.status === 'BUSTED', landingMs);

  return (
    <div
      className={`relative flex flex-col items-center rounded-2xl px-2 pb-1 pt-1 transition-shadow ${
        active ? 'shadow-[0_0_0_3px_rgba(241,215,122,0.9),0_0_30px_rgba(241,215,122,0.35)]' : ''
      }`}
      data-testid={`hand-${index}`}
    >
      <div className="mb-1 flex h-7 items-center gap-2 text-sm font-semibold text-cream">
        {total !== '0' && (
          <span
            className="rounded-full bg-black/45 px-2 py-0.5 tabular-nums"
            data-testid={`total-${index}`}
          >
            {multiple && `Mano ${index + 1} · `}
            {total}
          </span>
        )}
        <AnimatePresence>
          {result && (
            <motion.span
              key={result}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.35 * speed }}
              className={`rounded-full px-3 py-0.5 text-xs font-bold shadow-lg ${RESULT[result].className}`}
              data-testid={`hand-result-${index}`}
              data-result={result}
            >
              {RESULT[result].label}
              {winnings > 0n && ` +${formatChips(winnings.toString())}`}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex w-12 flex-col-reverse items-center gap-1 self-stretch">
          <AnimatePresence>
            {!lost && (
              <motion.div
                key="stake"
                exit={{
                  y: -360,
                  opacity: 0,
                  transition: {
                    duration: PACING.chips * speed,
                    ease: 'easeIn',
                    delay: 0.3 * speed,
                  },
                }}
              >
                <ChipStack
                  amount={hand.bet}
                  size={38}
                  from={{ x: 0, y: 160 }}
                  speed={speed}
                  testId={`stake-${index}`}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {winnings > 0n && (
            <ChipStack
              amount={winnings.toString()}
              size={38}
              from={{ x: 0, y: -360 }}
              speed={speed * 1.6}
              testId={`winnings-${index}`}
            />
          )}
        </div>

        <div className="relative flex min-h-[var(--card-h)] items-end pr-12">
          {hand.cards.map((card, i) => (
            <TableCard key={card.key} card={card} index={i} />
          ))}
          <AnimatePresence>
            {busted && !settled && (
              <motion.div
                key="bust"
                initial={{ scale: 2.2, opacity: 0, rotate: -18 }}
                animate={{ scale: 1, opacity: 1, rotate: -12 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                className="pointer-events-none absolute inset-x-0 top-1/3 mx-auto w-fit rounded-md border-4 border-red-500 bg-red-950/70 px-3 py-1 font-display text-xl font-bold uppercase tracking-wide text-red-300 shadow-xl"
                data-testid={`bust-${index}`}
              >
                ¡Te pasas!
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
