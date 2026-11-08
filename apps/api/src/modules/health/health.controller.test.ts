import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok', () => {
    const res = new HealthController().check();
    expect(res.status).toBe('ok');
    expect(res.service).toBe('casino-api');
    expect(Number.isNaN(Date.parse(res.timestamp))).toBe(false);
  });
});
