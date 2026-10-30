import { mkdirSync, writeFileSync } from 'node:fs';
const endpoints = [
  ['api', 'http://localhost:3001/api/v1/docs-json'],
  ['ai', 'http://localhost:8000/openapi.json'],
];
const directory = new URL(
  '../packages/shared-contracts/openapi/',
  import.meta.url,
);
mkdirSync(directory, { recursive: true });
for (const [name, url] of endpoints) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`OpenAPI ${name}: HTTP ${response.status}`);
  const contract = await response.json();
  writeFileSync(
    new URL(`${name}.json`, directory),
    `${JSON.stringify(contract, null, 2)}\n`,
  );
  console.log(`Contrato ${name} exportado.`);
}
