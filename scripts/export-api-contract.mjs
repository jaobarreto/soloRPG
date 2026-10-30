import { format } from 'prettier';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module.js');
const { createApiDocument } = require('./dist/configure-app.js');
const app = await NestFactory.create(AppModule, { logger: false });
try {
  app.setGlobalPrefix('api/v1');
  writeFileSync(
    new URL('../packages/shared-contracts/openapi/api.json', import.meta.url),
    await format(JSON.stringify(createApiDocument(app)), { parser: 'json' }),
  );
  console.log('Contrato OpenAPI da API exportado sem abrir portas.');
} finally {
  await app.close();
}
