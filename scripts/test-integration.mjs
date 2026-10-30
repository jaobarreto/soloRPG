import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const container = `solorpg-test-${randomUUID()}`;
const volume = `${container}-data`;
const password = randomBytes(24).toString('hex');
const image = readFileSync(
  new URL('../docker-compose.yml', import.meta.url),
  'utf8',
).match(/image: (pgvector\/pgvector:\S+)/)?.[1];
if (!image) throw new Error('PostgreSQL image missing from docker-compose.yml');
function docker(args) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, POSTGRES_PASSWORD: password },
  });
  if (result.status !== 0) throw new Error(result.stderr || 'Docker failed');
  return result.stdout.trim();
}
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once('error', reject);
  reservation.listen(0, '127.0.0.1', resolve);
});
const address = reservation.address();
if (!address || typeof address === 'string')
  throw new Error('Could not allocate a test port');
const fixedPort = address.port;
await new Promise((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
);
try {
  docker([
    'run',
    '--detach',
    '--rm',
    '--name',
    container,
    '--mount',
    `type=volume,source=${volume},target=/var/lib/postgresql/data`,
    '--publish',
    `127.0.0.1:${fixedPort}:5432`,
    '--env',
    'POSTGRES_PASSWORD',
    '--env',
    'POSTGRES_USER=test',
    '--env',
    'POSTGRES_DB=solorpg_test',
    image,
  ]);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = spawnSync(
      'docker',
      ['exec', container, 'pg_isready', '-U', 'test', '-d', 'solorpg_test'],
      { stdio: 'ignore' },
    );
    if (result.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Isolated PostgreSQL did not become ready');
  const port = docker(['port', container, '5432/tcp']).split(':').at(-1);
  console.log(
    'PostgreSQL isolado pronto; aplicando migrations e executando testes.',
  );
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@solo-rpg/api',
      'exec',
      'jest',
      '--config',
      'jest.integration.config.cjs',
      '--runInBand',
      ...process.argv.slice(2),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        INTEGRATION_DATABASE_URL: `postgresql://test:${password}@127.0.0.1:${port}/solorpg_test`,
        INTEGRATION_CONTAINER: container,
      },
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  // Only the unique test container is removed. Existing containers and volumes are untouched.
  const cleanup = spawnSync('docker', ['rm', '--force', container], {
    stdio: 'ignore',
  });
  if (cleanup.status === 0)
    spawnSync('docker', ['volume', 'rm', volume], { stdio: 'ignore' });
  if (cleanup.status !== 0)
    console.error(`Não foi possível remover o container de teste ${container}`);
}
