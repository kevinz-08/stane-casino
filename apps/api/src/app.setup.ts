import type { INestApplication } from '@nestjs/common';
import { REQUEST_ID_HEADER } from '@casino/shared';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { APP_CONFIG, type AppConfig } from './config/app-config';

/** HTTP-level setup shared by `main.ts` and the end-to-end tests. */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.webOrigins,
    credentials: true, // the refresh-token cookie
    exposedHeaders: [REQUEST_ID_HEADER],
  });
  app.enableShutdownHooks();
  return app;
}
