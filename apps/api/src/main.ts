import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_CONFIG, type AppConfig } from './config/app-config';
import { loadDotEnv } from './config/env-file';

async function bootstrap() {
  loadDotEnv();
  const app = configureApp(await NestFactory.create(AppModule, { bufferLogs: true }));
  const { port } = app.get<AppConfig>(APP_CONFIG);
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}`);
}

void bootstrap();
