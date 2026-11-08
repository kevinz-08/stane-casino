'use client';

import { motion } from 'motion/react';
import { formatChips } from '@/lib/format';
import { Chip, toChips } from './chip';

const MAX_VISIBLE = 10;

/**
 * A stack of chips for an amount. `from` is where new chips fly in from (px offset), so the
 * same component animates a bet being placed, a double, or a payout arriving.
 */
export function ChipStack({
  amount,
  size = 44,
  from,
  speed = 1,
  label = true,
  testId,
}: {
  amount: string;
  size?: number;
  from?: { x: number; y: number };
  speed?: number;
  label?: boolean;
  testId?: string;
}) {
  const value = BigInt(amount || '0');
  if (value <= 0n) return null;
  const chips = toChips(value).reverse().slice(-MAX_VISIBLE); // small chips at the bottom
  const step = Math.round(size * 0.09);

  return (
    <div className="flex flex-col items-center" data-testid={testId} data-amount={amount}>
      <div className="relative" style={{ width: size, height: size + step * (chips.length - 1) }}>
        {chips.map((chip, i) => (
          <motion.div
            key={`${i}-${chip}`}
            className="absolute left-0"
            style={{ bottom: i * step }}
            initial={from && speed > 0 ? { x: from.x, y: from.y, opacity: 0 } : false}
            animate={{ x: 0, y: 0, opacity: 1 }}
            transition={{
              duration: 0.35 * speed,
              delay: Math.min(i, 6) * 0.035 * speed,
              ease: 'easeOut',
            }}
          >
            <Chip value={chip} size={size} />
          </motion.div>
        ))}
      </div>
      {label && (
        <span className="mt-1 rounded-full bg-black/50 px-2 py-0.5 font-mono text-xs tabular-nums text-cream">
          {formatChips(amount)}
        </span>
      )}
    </div>
  );
}
