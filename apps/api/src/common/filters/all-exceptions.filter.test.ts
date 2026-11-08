import { type ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { InsufficientFundsError } from '../../modules/wallet/wallet.errors';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: 'req-1', url: '/x' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: (status.mock.calls[0] as unknown[])[0], body: json.mock.calls[0]?.[0] };
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('maps domain errors to their status and code', () => {
    const { status, body } = run(new InsufficientFundsError('acc', 5n, 10n));
    expect(status).toBe(422);
    expect(body).toMatchObject({ code: 'INSUFFICIENT_FUNDS', requestId: 'req-1' });
  });

  it('keeps custom codes and details of HTTP exceptions', () => {
    const { status, body } = run(
      new BadRequestException({ code: 'VALIDATION_FAILED', message: 'bad', details: ['a'] }),
    );
    expect(status).toBe(400);
    expect(body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'bad',
      details: ['a'],
      requestId: 'req-1',
    });
  });

  it('derives a code from the status for plain HTTP exceptions', () => {
    expect(run(new NotFoundException()).body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('hides internals of unexpected errors', () => {
    const { status, body } = run(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(body).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });
});
