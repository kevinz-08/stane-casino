import type { Card } from '@casino/game-engine';
import { CardBack, CardFace } from './cards/card-art';
import { RANK_NAMES, SUIT_NAMES } from './cards/suits';

export function cardLabel(card: Card): string {
  const rank = card[0] as string;
  return `${RANK_NAMES[rank] ?? rank} de ${SUIT_NAMES[card[1] as string] ?? ''}`;
}

/** A static card, or its back when `card` is null. */
export function PlayingCard({ card, small = false }: { card: Card | null; small?: boolean }) {
  const size = small ? 'h-14 w-10' : 'h-28 w-20';
  return (
    <div
      className={`${size} shrink-0 drop-shadow-md`}
      role="img"
      aria-label={card ? cardLabel(card) : 'Carta boca abajo'}
      data-card={card ?? undefined}
    >
      {card ? <CardFace card={card} /> : <CardBack />}
    </div>
  );
}
