-- AlterTable
ALTER TABLE "GameRound" ADD COLUMN     "idempotencyKey" TEXT NOT NULL,
ADD COLUMN     "requestHash" TEXT NOT NULL,
ADD COLUMN     "rulesVersion" TEXT NOT NULL,
ADD COLUMN     "totalBet" BIGINT NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "GameRound_userId_idempotencyKey_key" ON "GameRound"("userId", "idempotencyKey");


-- =====================================================================================
-- Rounds and seeds invariants (hand-written). See ADR-003 and docs/ARCHITECTURE.md.
-- =====================================================================================

-- Round events are append-only, like the ledger (reuses the function from the init migration).
CREATE TRIGGER "RoundEvent_immutable"
  BEFORE UPDATE OR DELETE ON "RoundEvent"
  FOR EACH ROW EXECUTE FUNCTION ledger_reject_mutation();
CREATE TRIGGER "RoundEvent_no_truncate"
  BEFORE TRUNCATE ON "RoundEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_reject_mutation();

-- A player has at most one unfinished round per game.
CREATE UNIQUE INDEX "GameRound_one_open_round_per_game"
  ON "GameRound"("userId", "game") WHERE "status" IN ('CREATED', 'IN_PROGRESS');

-- A player has exactly one active seed pair at a time.
CREATE UNIQUE INDEX "SeedPair_one_active_per_user"
  ON "SeedPair"("userId") WHERE "status" = 'ACTIVE';

ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_amounts_valid"
  CHECK ("bet" > 0 AND "totalBet" >= "bet" AND ("payout" IS NULL OR "payout" >= 0));
ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_settled_has_payout"
  CHECK (("status" = 'SETTLED') = ("payout" IS NOT NULL AND "settledAt" IS NOT NULL));
ALTER TABLE "SeedPair" ADD CONSTRAINT "SeedPair_nonce_non_negative" CHECK ("nextNonce" >= 0);
ALTER TABLE "SeedPair" ADD CONSTRAINT "SeedPair_revealed_has_date"
  CHECK (("status" = 'REVEALED') = ("revealedAt" IS NOT NULL));
