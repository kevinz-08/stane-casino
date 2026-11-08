import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorDto } from '@casino/shared';
import type { Request, Response } from 'express';
import { DomainError } from '../errors/domain-error';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

/**
 * Turns every error into an `ApiErrorDto`. Unexpected errors are logged with their stack and
 * answered with a generic 500 so internals never leak to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string | number }>();
    const res = ctx.getResponse<Response>();
    const requestId = req.id === undefined ? undefined : String(req.id);

    const body = this.toBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(
        { err: exception, requestId, path: req.url },
        exception instanceof Error ? exception.message : 'Unhandled error',
      );
    }
    res.status(body.statusCode).json({ ...body, requestId });
  }

  private toBody(exception: unknown): ApiErrorDto {
    if (exception instanceof DomainError) {
      return {
        statusCode: exception.httpStatus,
        code: exception.code,
        message: exception.message,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      const fallbackCode = CODE_BY_STATUS[statusCode] ?? 'ERROR';
      if (typeof response === 'string') {
        return { statusCode, code: fallbackCode, message: response };
      }
      const r = response as { code?: unknown; message?: unknown; details?: unknown };
      const message = Array.isArray(r.message)
        ? r.message.join('; ')
        : typeof r.message === 'string'
          ? r.message
          : exception.message;
      return {
        statusCode,
        code: typeof r.code === 'string' ? r.code : fallbackCode,
        message,
        ...(Array.isArray(r.details) ? { details: r.details.map(String) } : {}),
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };
  }
}
