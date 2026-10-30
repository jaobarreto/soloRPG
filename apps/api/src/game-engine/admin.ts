import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GameEngineService } from './game-engine.service';
async function main() {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3)
    throw new Error('Usage: engine:command /absolute/path/command.json');
  const input: unknown = JSON.parse(await readFile(file, 'utf8'));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    console.log(
      JSON.stringify(await app.get(GameEngineService).executeInternal(input)),
    );
  } finally {
    await app.close();
  }
}
main().catch((error: unknown) => {
  // SQL errors may embed private command contents. Only validated domain errors are printable.
  const response =
    error &&
    typeof error === 'object' &&
    'getResponse' in error &&
    typeof error.getResponse === 'function'
      ? error.getResponse()
      : 'Command failed; no receipt was committed.';
  console.error(JSON.stringify(response));
  process.exitCode = 1;
});
