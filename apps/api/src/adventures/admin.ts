import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AdventureService } from './core/operations/adventure.service';
async function main() {
  if (process.argv.length !== 3)
    throw new Error('Usage: adventure:command /absolute/path/command.json');
  const raw: unknown = JSON.parse(await readFile(process.argv[2]!, 'utf8'));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    console.log(JSON.stringify(await app.get(AdventureService).execute(raw)));
  } finally {
    await app.close();
  }
}
main().catch((error: unknown) => {
  const response =
    error &&
    typeof error === 'object' &&
    'getResponse' in error &&
    typeof error.getResponse === 'function'
      ? error.getResponse()
      : 'Adventure command failed; transaction rolled back.';
  console.error(JSON.stringify(response));
  process.exitCode = 1;
});
