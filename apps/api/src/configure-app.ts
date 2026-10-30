import { ApiExceptionFilter } from './api-exception.filter';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin: app.get(ConfigService).getOrThrow<string[]>('CORS_ORIGINS'),
    methods: ['GET', 'POST', 'PATCH'],
    credentials: false,
  });
  SwaggerModule.setup('api/v1/docs', app, createApiDocument(app));
  app.enableShutdownHooks();
}
export function createApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('SoloRPG API')
    .setDescription(
      'Campaigns, sessions, persistent chat, Blue Rose AGE and validated narrative actions',
    )
    .setVersion('0.4.0')
    .build();
  return SwaggerModule.createDocument(app, config);
}
