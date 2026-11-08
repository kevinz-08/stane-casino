'use client';

import { motion, useAnimate } from 'motion/react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { CardBack, CardFace } from '@/components/cards/card-art';
import { cardLabel } from '@/components/playing-card';
import { PACING } from './pacing';
import type { SceneCard } from './scene';
import { offsetTo, useTable } from './table-context';

/** Small, stable "hand placed" tilt per card so a hand never looks machine-aligned. */
function tilt(key: string): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 50) - 25) / 10; // −2.5° … +2.5°
}

const SHADOW = 'shadow-[0_2px_0_rgb(0_0_0/0.15),0_6px_14px_rgb(0_0_0/0.35)]';

/**
 * A card on the table, sized by the `--card-h` CSS variable of the table.
 *
 * A freshly dealt card leaves the shoe face down, flies to its place and only then turns
 * over (so its value is seen when it lands, not while it travels). The dealer's hole card
 * turns after a beat of suspense. The face of a face-down card is never rendered.
 */
export function TableCard({ card, index }: { card: SceneCard; index: number }) {
  const { shoe, speed } = useTable();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const rotate = tilt(card.key);
  const wasFaceUp = useRef(card.faceUp);

  useLayoutEffect(() => {
    if (!card.fresh || speed === 0 || !scope.current) return;
    const from = offsetTo(scope.current, shoe.current);
    void animate(
      scope.current,
      { x: [from.x, 0], y: [from.y, 0], rotate: [-35, rotate], scale: [0.85, 1] },
      { duration: PACING.flight * speed, ease: [0.2, 0.8, 0.3, 1] },
    );
  }, []); // only on mount: a card flies in once

  // When does the face turn up? The hole card (face down until now): after a pause.
  // A card dealt face up: once it has landed. (The ref holds the last COMMITTED value, so
  // a double render in StrictMode sees the same thing.)
  const turnedNow = card.faceUp && !wasFaceUp.current;
  useEffect(() => {
    wasFaceUp.current = card.faceUp;
  }, [card.faceUp]);
  const flipDelay = turnedNow ? PACING.revealPause : card.fresh ? PACING.flight : 0;
  const flipDuration = turnedNow ? PACING.revealFlip : PACING.flip;

  return (
    <motion.div
      ref={scope}
      layoutId={card.key}
      transition={{ duration: 0.35 * speed }}
      className="relative shrink-0"
      style={{
        height: 'var(--card-h)',
        width: 'calc(var(--card-h) * 0.714)',
        rotate,
        marginLeft: index === 0 ? 0 : 'calc(var(--card-h) * -0.36)',
        perspective: 800,
        willChange: card.fresh ? 'transform' : undefined,
      }}
      role="img"
      aria-label={card.faceUp && card.card ? cardLabel(card.card) : 'Carta boca abajo'}
      data-card={card.faceUp && card.card ? card.card : undefined}
      data-testid="table-card"
    >
      <motion.div
        className="card-3d absolute inset-0"
        initial={card.fresh && speed > 0 ? { rotateY: 180 } : false}
        animate={{ rotateY: card.faceUp ? 0 : 180 }}
        transition={{
          duration: flipDuration * speed,
          delay: flipDelay * speed,
          ease: 'easeInOut',
        }}
      >
        {card.faceUp && card.card && (
          <div className={`card-face absolute inset-0 rounded-[0.55rem] ${SHADOW}`}>
            <CardFace card={card.card} />
          </div>
        )}
        <div
          className={`card-face absolute inset-0 rounded-[0.55rem] ${SHADOW}`}
          style={{ transform: 'rotateY(180deg)' }}
        >
          <CardBack />
        </div>
      </motion.div>
    </motion.div>
  );
}
