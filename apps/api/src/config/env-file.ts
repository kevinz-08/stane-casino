import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Loads the monorepo's `.env` (searching upwards from `startDir`) into `process.env`.
 * Variables already present in the environment win, so CI and shells can override the file.
 * Returns the path that was loaded, or null if none was found.
 */
export function loadDotEnv(startDir: string = process.cwd(), maxLevels = 3): string | null {
  let dir = resolve(startDir);
  for (let level = 0; level <= maxLevels; level++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      const parsed = parseEnv(readFileSync(candidate, 'utf8'));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
      }
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
