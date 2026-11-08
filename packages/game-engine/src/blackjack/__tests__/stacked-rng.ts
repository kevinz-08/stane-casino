import type { Rng } from '../../rng';
import { type Card, canonicalShoe } from '../cards';

/**
 * Test double: a fresh-Rng factory that makes the REAL lazy Fisher–Yates deal `order` first
 * (deal order: player, dealer up, player, dealer hole, then hits / splits / dealer draws).
 * Each call returns a new Rng, mirroring how the engine resumes a round.
 */
export function stackedRng(order: readonly Card[], decks = 6): () => Rng {
  return () => {
    const items = canonicalShoe(decks);
    let i = 0;
    return {
      nextFloat: () => 0,
      nextInt(max: number) {
        if (max !== items.length - i) throw new Error('unexpected nextInt bound');
        const wanted = order[i];
        let j = i;
        if (wanted !== undefined) {
          j = items.indexOf(wanted, i);
          if (j === -1) throw new Error(`no ${wanted} left in the shoe`);
        }
        [items[i], items[j]] = [items[j] as Card, items[i] as Card];
        i++;
        return j - (i - 1);
      },
    };
  };
}
