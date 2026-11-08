import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { REQUEST_ID_HEADER } from '@casino/shared';
import { LoggerModule } from 'nestjs-pino';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

const VALID_REQUEST_ID = /^[\w.:-]{1,128}$/;

/**
 * Reuses a well-formed incoming `x-request-id` (e.g. from a proxy) or mints a new one, and echoes
 * it in the response so clients can quote it.
 */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/** Structured JSON logs (pino). Every log line of a request carries `req.id` and `userId`. */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.log.level,
          genReqId: resolveRequestId,
          customProps: (req: IncomingMessage) => ({
            userId: (req as IncomingMessage & { user?: { sub?: string } }).user?.sub,
          }),
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
            censor: '[redacted]',
          },
          autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
          transport: config.log.pretty
            ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
            : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
