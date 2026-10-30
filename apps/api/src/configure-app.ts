import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: app.get(ConfigService).getOrThrow<string[]>('CORS_ORIGINS'),
    methods: ['GET'],
    credentials: false,
  });
  const config = new DocumentBuilder()
    .setTitle('SoloRPG API')
    .setDescription('Bootstrap health endpoints')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup(
    'api/v1/docs',
    app,
    SwaggerModule.createDocument(app, config),
  );
  app.enableShutdownHooks();
}
