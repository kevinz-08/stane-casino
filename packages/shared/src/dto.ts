/**
 * Wire-format DTOs. Chip amounts travel as decimal strings because JSON cannot carry bigint.
 */
export type ChipAmountString = string;

export interface HealthResponseDto {
  status: 'ok';
  service: string;
  uptimeSeconds: number;
  timestamp: string;
}

// TODO(phase-1): RegisterDto, LoginDto, WalletBalanceDto, LedgerEntryDto
// TODO(phase-2): BetIntentDto, RoundEventDto, SeedCommitmentDto
