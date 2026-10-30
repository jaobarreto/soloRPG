import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const binary = existsSync(`${root}.tools/bin/uv`)
  ? `${root}.tools/bin/uv`
  : 'uv';
const result = spawnSync(binary, process.argv.slice(2), {
  cwd: `${root}apps/ai-service`,
  stdio: 'inherit',
  env: {
    ...process.env,
    UV_CACHE_DIR: process.env.UV_CACHE_DIR ?? `${root}.tools/uv-cache`,
    UV_PYTHON_INSTALL_DIR:
      process.env.UV_PYTHON_INSTALL_DIR ?? `${root}.tools/python`,
  },
});
if (result.error)
  console.error(
    'Instale uv: https://docs.astral.sh/uv/getting-started/installation/',
  );
process.exit(result.status ?? 1);
