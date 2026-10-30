import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get(ConfigService);
  await app.listen(
    config.getOrThrow<number>('API_PORT'),
    config.getOrThrow<string>('API_HOST'),
  );
}
void bootstrap().catch(() => {
  Logger.error(
    'API startup failed. Check environment configuration.',
    'Bootstrap',
  );
  process.exitCode = 1;
});
