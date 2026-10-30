# Testes da integração narrativa

Executar a partir da raiz:

```bash
pnpm python:sync
pnpm --filter @solo-rpg/shared-contracts build
pnpm test:integration
pnpm --filter @solo-rpg/api test:coverage
pnpm --filter @solo-rpg/ai-service test
pnpm typecheck
pnpm lint
```

`scripts/test-integration.mjs` cria um PostgreSQL descartável, aplica migrations e
remove somente seu container/volume exclusivo. Não aponta para a campanha real.
`test/integration/narrative.spec.ts` cobre oficialização, retomada, rolagens, falhas,
continuidade entre sessões, efeitos dependentes, conhecimento e combate.

Contratos rejeitam patches arbitrários e comandos no narrador. Python verifica os
quatro modos, grafo, autenticação interna e provedores simulados, incluindo limites,
timeout, conexão e fallback restrito. O gateway TypeScript é testado com fetch
simulado, autenticando chamadas e limitando a resposta antes de fazer parse JSON.

Os testes do motor das Fases 1–3 continuam na suíte completa. Não é necessário usar
chaves externas para testes automatizados. Dados determinísticos nos testes não
substituem o RNG criptográfico da aplicação.

Cobertura e resultados efetivamente executados devem ser conferidos na entrega e
na saída dos comandos. A avaliação de APIs reais depende de chave gratuita válida e
configuração explícita; sem isso, não alegar consumo ou qualidade observados.
