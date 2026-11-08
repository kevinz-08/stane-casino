import type { Card } from '@casino/game-engine';

const SUIT: Record<string, { symbol: string; name: string; red: boolean }> = {
  S: { symbol: '♠', name: 'picas', red: false },
  H: { symbol: '♥', name: 'corazones', red: true },
  D: { symbol: '♦', name: 'diamantes', red: true },
  C: { symbol: '♣', name: 'tréboles', red: false },
};

const RANK: Record<string, string> = { T: '10' };

/** A card, or its back when `card` is null (the dealer's hole card). */
export function PlayingCard({ card, small = false }: { card: Card | null; small?: boolean }) {
  const size = small ? 'h-12 w-9 text-sm' : 'h-24 w-16 text-xl';
  if (!card) {
    return (
      <div
        className={`${size} rounded-md border border-white/20 bg-[repeating-linear-gradient(45deg,#1e3a5f_0_6px,#16304f_6px_12px)] shadow`}
        aria-label="Carta boca abajo"
      />
    );
  }
  const suit = SUIT[card[1] as string] ?? { symbol: '?', name: '', red: false };
  const rank = RANK[card[0] as string] ?? card[0];
  return (
    <div
      className={`${size} flex flex-col justify-between rounded-md bg-white p-1 font-semibold shadow ${suit.red ? 'text-red-600' : 'text-slate-900'}`}
      aria-label={`${rank} de ${suit.name}`}
    >
      <span className="leading-none">{rank}</span>
      <span className="self-end leading-none">{suit.symbol}</span>
    </div>
  );
}
