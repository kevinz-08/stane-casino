'use client';

import { animate } from 'motion';
import { useEffect, useRef, useState } from 'react';
import { formatChips } from '@/lib/format';

/** A chip amount that counts up or down to its new value (and flashes the direction). */
export function AnimatedChips({ value }: { value: string | null }) {
  const [shown, setShown] = useState(value);
  const [trend, setTrend] = useState<'up' | 'down' | null>(null);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (value === null || from === null || from === value || !/^\d+$/.test(value + from)) {
      setShown(value);
      return;
    }
    const start = Number(from);
    const end = Number(value);
    setTrend(end > start ? 'up' : 'down');
    const controls = animate(start, end, {
      duration: Math.min(1.2, 0.3 + Math.abs(end - start) / 2000),
      ease: 'easeOut',
      onUpdate: (v) => setShown(Math.round(v).toString()),
      onComplete: () => setTimeout(() => setTrend(null), 600),
    });
    return () => controls.stop();
  }, [value]);

  return (
    <span
      className={`transition-colors duration-500 ${trend === 'up' ? 'text-emerald-300' : trend === 'down' ? 'text-red-300' : ''}`}
    >
      {formatChips(shown)}
    </span>
  );
}
