import type { Card } from '@casino/game-engine';
import { RANK_LABELS, RED_SUITS, SuitShape } from './suits';

/** Pip positions (in a 100×140 card) for number cards, as on a classic French deck. */
const L = 32;
const C = 50;
const R = 68;
const PIPS: Record<string, Array<[number, number]>> = {
  '2': [
    [C, 30],
    [C, 110],
  ],
  '3': [
    [C, 30],
    [C, 70],
    [C, 110],
  ],
  '4': [
    [L, 30],
    [R, 30],
    [L, 110],
    [R, 110],
  ],
  '5': [
    [L, 30],
    [R, 30],
    [C, 70],
    [L, 110],
    [R, 110],
  ],
  '6': [
    [L, 30],
    [R, 30],
    [L, 70],
    [R, 70],
    [L, 110],
    [R, 110],
  ],
  '7': [
    [L, 30],
    [R, 30],
    [C, 50],
    [L, 70],
    [R, 70],
    [L, 110],
    [R, 110],
  ],
  '8': [
    [L, 30],
    [R, 30],
    [C, 50],
    [L, 70],
    [R, 70],
    [C, 90],
    [L, 110],
    [R, 110],
  ],
  '9': [
    [L, 30],
    [R, 30],
    [L, 57],
    [R, 57],
    [C, 70],
    [L, 83],
    [R, 83],
    [L, 110],
    [R, 110],
  ],
  T: [
    [L, 30],
    [R, 30],
    [C, 44],
    [L, 57],
    [R, 57],
    [L, 83],
    [R, 83],
    [C, 96],
    [L, 110],
    [R, 110],
  ],
};

const FACE_COLORS: Record<string, string> = { J: '#1d4ed8', Q: '#b91c1c', K: '#a16207' };

/** The face of a card, as an SVG (scales crisply to any size). */
export function CardFace({ card }: { card: Card }) {
  const rank = card[0] as string;
  const suit = card[1] as string;
  const color = RED_SUITS.has(suit) ? '#c0262d' : '#111827';
  const label = RANK_LABELS[rank] ?? rank;
  const isFace = rank === 'J' || rank === 'Q' || rank === 'K';

  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
      <rect
        x="1"
        y="1"
        width="98"
        height="138"
        rx="9"
        fill="#fffdf7"
        stroke="#d6d0c0"
        strokeWidth="1.5"
      />
      <g fill={color}>
        {/* corner indices */}
        <text
          x="10"
          y="22"
          fontSize="19"
          fontWeight="700"
          fontFamily="var(--font-inter), sans-serif"
        >
          {label}
        </text>
        <SuitShape suit={suit} x={16} y={33} size={12} />
        <g transform="rotate(180 50 70)">
          <text
            x="10"
            y="22"
            fontSize="19"
            fontWeight="700"
            fontFamily="var(--font-inter), sans-serif"
          >
            {label}
          </text>
          <SuitShape suit={suit} x={16} y={33} size={12} />
        </g>

        {rank === 'A' && <SuitShape suit={suit} x={50} y={70} size={suit === 'S' ? 46 : 38} />}

        {PIPS[rank]?.map(([x, y], i) => (
          <SuitShape key={i} suit={suit} x={x} y={y} size={18} flip={y > 70} />
        ))}

        {isFace && (
          <>
            <rect
              x="22"
              y="24"
              width="56"
              height="92"
              rx="5"
              fill={FACE_COLORS[rank]}
              fillOpacity="0.1"
              stroke={FACE_COLORS[rank]}
              strokeOpacity="0.6"
              strokeWidth="1.5"
            />
            {/* crown */}
            <path
              d="M37 50 L40 38 L46 46 L50 34 L54 46 L60 38 L63 50 Z"
              fill="#d4af37"
              stroke="#8a6d1c"
              strokeWidth="1"
            />
            <text
              x="50"
              y="88"
              textAnchor="middle"
              fontSize="38"
              fontWeight="700"
              fontFamily="var(--font-playfair), serif"
            >
              {rank}
            </text>
            <SuitShape suit={suit} x={50} y={102} size={14} />
          </>
        )}
      </g>
    </svg>
  );
}

/** Back of a card (house design). */
export function CardBack() {
  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
      <defs>
        <pattern
          id="card-back-pattern"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="10" height="10" fill="#7f1d1d" />
          <rect width="5" height="10" fill="#991b1b" />
        </pattern>
      </defs>
      <rect
        x="1"
        y="1"
        width="98"
        height="138"
        rx="9"
        fill="#fffdf7"
        stroke="#d6d0c0"
        strokeWidth="1.5"
      />
      <rect x="7" y="7" width="86" height="126" rx="6" fill="url(#card-back-pattern)" />
      <rect
        x="7"
        y="7"
        width="86"
        height="126"
        rx="6"
        fill="none"
        stroke="#d4af37"
        strokeWidth="2"
      />
      <circle cx="50" cy="70" r="15" fill="#7f1d1d" stroke="#d4af37" strokeWidth="2" />
      <g fill="#d4af37">
        <SuitShape suit="S" x={50} y={70} size={16} />
      </g>
    </svg>
  );
}
