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
  const config = new DocumentBuilder()
    .setTitle('SoloRPG API')
    .setDescription('Campaigns, sessions and persistent chat')
    .setVersion('0.2.0')
    .build();
  SwaggerModule.setup(
    'api/v1/docs',
    app,
    SwaggerModule.createDocument(app, config),
  );
  app.enableShutdownHooks();
}
