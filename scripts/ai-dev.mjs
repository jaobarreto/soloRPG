import { spawn } from 'node:child_process';
const child = spawn(
  process.execPath,
  [
    new URL('./uv.mjs', import.meta.url).pathname,
    'run',
    '--locked',
    'uvicorn',
    'app.main:app',
    '--reload',
    '--host',
    '127.0.0.1',
    '--port',
    process.env.AI_SERVICE_PORT ?? '8000',
  ],
  { stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
