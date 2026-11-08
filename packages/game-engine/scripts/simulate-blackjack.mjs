#!/usr/bin/env node
// Usage: pnpm --filter @casino/game-engine simulate:blackjack [rounds] [seed]
// Requires a build (`pnpm --filter @casino/game-engine build`).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { simulateBlackjack, BLACKJACK_REFERENCE_HOUSE_EDGE_V1 } = require('../dist/index.js');

const rounds = Number(process.argv[2] ?? 1_000_000);
const seed = process.argv[3] ?? 'cli';
const started = Date.now();
const r = simulateBlackjack({ rounds, seed });
const pct = (x) => `${(x * 100).toFixed(3)} %`;
console.log(`rounds:           ${r.rounds.toLocaleString('en')}`);
console.log(`house edge:       ${pct(r.houseEdge)} ± ${pct(1.96 * r.standardError)} (95 % CI)`);
console.log(`reference (bj-v1): ${pct(BLACKJACK_REFERENCE_HOUSE_EDGE_V1)}`);
console.log(`total staked:     ${r.totalBet} chips (initial bets ${r.totalInitialBet})`);
console.log(`total returned:   ${r.totalPayout} chips`);
console.log(
  `blackjacks / splits / doubles / insurance offered: ${Object.values(r.outcomes).join(' / ')}`,
);
console.log(`time:             ${((Date.now() - started) / 1000).toFixed(1)} s`);
