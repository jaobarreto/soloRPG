const targets = [
  ['Frontend', process.env.SMOKE_WEB_URL ?? 'http://localhost:3000', null],
  ['API', 'http://localhost:3001/api/v1/health', 'solo-rpg-api'],
  [
    'PostgreSQL via Drizzle',
    'http://localhost:3001/api/v1/health/database',
    'postgresql',
  ],
  [
    'FastAPI via NestJS',
    'http://localhost:3001/api/v1/health/ai-service',
    'solo-rpg-ai',
  ],
];
if (process.env.SMOKE_AI_DIRECT === '1')
  targets.push([
    'FastAPI direto',
    'http://localhost:8000/health',
    'solo-rpg-ai',
  ]);
let failed = false;
for (const [name, url, service] of targets) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    if (service) {
      const body = await response.json();
      if (body.status !== 'ok' || body.service !== service)
        throw Error('Resposta inválida');
    } else if (!(await response.text()).includes('SoloRPG'))
      throw Error('Página inesperada');
    console.log(`OK ${name}: ${url}`);
  } catch (error) {
    failed = true;
    console.error(`FALHOU ${name}: ${error.message}`);
  }
}
process.exitCode = failed ? 1 : 0;
