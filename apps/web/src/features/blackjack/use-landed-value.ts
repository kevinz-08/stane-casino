'use client';

import { useEffect, useState } from 'react';

/**
 * Shows a value only after `delayMs` (e.g. a hand total once the new card has landed and
 * turned over), so labels never announce what the cards have not shown yet.
 * With a delay of 0 the value is shown immediately.
 */
export function useLandedValue<T>(value: T, delayMs: number): T {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (delayMs <= 0) {
      setShown(value);
      return;
    }
    const t = setTimeout(() => setShown(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return delayMs <= 0 ? value : shown;
}
