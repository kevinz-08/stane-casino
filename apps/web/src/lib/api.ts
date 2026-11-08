import type { HealthResponseDto } from '@casino/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function getHealth(): Promise<HealthResponseDto> {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) throw new Error(`API health failed: ${res.status}`);
  return (await res.json()) as HealthResponseDto;
}

// TODO(fase-1): typed fetch wrapper with auth + error handling
// TODO(fase-3): socket.io-client connection helper (add dependency in that phase)
