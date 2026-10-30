import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const password = randomBytes(24).toString('hex');
const template = readFileSync(
  new URL('../.env.example', import.meta.url),
  'utf8',
);
const content = template
  .replace(
    'AI_INTERNAL_TOKEN=',
    'AI_INTERNAL_TOKEN=' + randomBytes(32).toString('hex'),
  )
  .replace('POSTGRES_PASSWORD=', 'POSTGRES_PASSWORD=' + password)
  .replace(
    'DATABASE_URL=',
    'DATABASE_URL=postgresql://solorpg:' + password + '@127.0.0.1:5432/solorpg',
  );
try {
  writeFileSync(new URL('../.env', import.meta.url), content, {
    flag: 'wx',
    mode: 0o600,
  });
  console.log('.env criado com senha aleatória local.');
} catch (error) {
  if (error.code === 'EEXIST')
    console.log('.env já existe; configuração preservada.');
  else throw error;
}
