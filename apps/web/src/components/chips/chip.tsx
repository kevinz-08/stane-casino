/** Chips the player bets with. All even, so any combination is a valid blackjack bet. */
export const BETTING_CHIPS = [10, 20, 50, 100, 500] as const;
/** Every denomination drawn on the table (5 and 1 only appear in payouts and insurance). */
export const CHIP_VALUES = [500, 100, 50, 20, 10, 5, 1] as const;
export type ChipValue = (typeof CHIP_VALUES)[number];

const STYLE: Record<ChipValue, { base: string; edge: string; text: string }> = {
  1: { base: '#f5f5f4', edge: '#78716c', text: '#292524' },
  5: { base: '#ea580c', edge: '#ffedd5', text: '#ffffff' },
  10: { base: '#2563eb', edge: '#e5edff', text: '#ffffff' },
  20: { base: '#dc2626', edge: '#ffe4e4', text: '#ffffff' },
  50: { base: '#15803d', edge: '#dcfce7', text: '#ffffff' },
  100: { base: '#1f2937', edge: '#e5e7eb', text: '#f1d77a' },
  500: { base: '#7c3aed', edge: '#f3e8ff', text: '#ffffff' },
};

/** A clay casino chip, drawn in SVG. */
export function Chip({ value, size = 48 }: { value: ChipValue; size?: number }) {
  const s = STYLE[value];
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
      className="rounded-full shadow-[0_2px_0_rgb(0_0_0/0.35),0_4px_8px_rgb(0_0_0/0.3)]"
    >
      <circle cx="50" cy="50" r="48" fill={s.base} />
      {/* edge inserts */}
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        stroke={s.edge}
        strokeWidth="10"
        strokeDasharray="14 19"
        transform="rotate(-8 50 50)"
      />
      <circle
        cx="50"
        cy="50"
        r="31"
        fill={s.base}
        stroke={s.edge}
        strokeOpacity="0.8"
        strokeWidth="2"
      />
      <circle
        cx="50"
        cy="50"
        r="26"
        fill="none"
        stroke={s.edge}
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontSize={value >= 100 ? 22 : 26}
        fontWeight="800"
        fill={s.text}
        fontFamily="var(--font-inter), sans-serif"
      >
        {value}
      </text>
      <circle cx="50" cy="50" r="48" fill="none" stroke="rgb(0 0 0 / 0.25)" strokeWidth="2" />
    </svg>
  );
}

/** Splits an amount into chips, largest first (greedy is optimal for this canonical set). */
export function toChips(amount: bigint): ChipValue[] {
  const chips: ChipValue[] = [];
  let rest = amount;
  for (const value of CHIP_VALUES) {
    while (rest >= BigInt(value) && chips.length < 40) {
      chips.push(value);
      rest -= BigInt(value);
    }
  }
  return chips;
}
