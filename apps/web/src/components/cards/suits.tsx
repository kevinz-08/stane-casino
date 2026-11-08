/** Suit shapes drawn in a 100×100 box (no font glyphs: identical on every platform). */
export const SUIT_PATHS: Record<string, string> = {
  S: 'M50 6 C88 38 100 60 82 74 C68 84 56 77 53 69 C55 82 60 90 68 96 L32 96 C40 90 45 82 47 69 C44 77 32 84 18 74 C0 60 12 38 50 6 Z',
  H: 'M50 92 C12 64 0 40 16 22 C30 8 46 14 50 30 C54 14 70 8 84 22 C100 40 88 64 50 92 Z',
  D: 'M50 4 L88 50 L50 96 L12 50 Z',
  C: 'M50 8 A19 19 0 0 1 66 39 A19 19 0 1 1 57 66 C58 80 62 89 70 96 L30 96 C38 89 42 80 43 66 A19 19 0 1 1 34 39 A19 19 0 0 1 50 8 Z',
};

export const RED_SUITS = new Set(['H', 'D']);

export const SUIT_NAMES: Record<string, string> = {
  S: 'picas',
  H: 'corazones',
  D: 'diamantes',
  C: 'tréboles',
};

export const RANK_LABELS: Record<string, string> = { T: '10', A: 'A', J: 'J', Q: 'Q', K: 'K' };

export const RANK_NAMES: Record<string, string> = {
  A: 'As',
  T: '10',
  J: 'Jota',
  Q: 'Reina',
  K: 'Rey',
};

export function SuitShape({
  suit,
  x,
  y,
  size,
  flip = false,
}: {
  suit: string;
  x: number;
  y: number;
  size: number;
  flip?: boolean;
}) {
  const scale = size / 100;
  return (
    <path
      d={SUIT_PATHS[suit]}
      transform={`translate(${x - size / 2} ${y - size / 2}) scale(${scale})${flip ? ' rotate(180 50 50)' : ''}`}
    />
  );
}
