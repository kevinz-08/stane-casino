const chips = new Intl.NumberFormat('es-ES');

/** Formats a chip amount received as a decimal string (bigint over the wire). */
export function formatChips(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || !/^-?\d+$/.test(amount)) return '—';
  return chips.format(BigInt(amount));
}

const dateTime = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'medium' });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}
