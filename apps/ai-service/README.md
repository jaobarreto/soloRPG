# Serviço de IA

`/health` independe de chaves externas. `POST /internal/turn` exige `X-AI-Token`
configurado em AI_INTERNAL_TOKEN. LangGraph separa proposta de narração confirmada;
todo checkpoint persistente e estado oficial pertencem ao NestJS/PostgreSQL.

Gemini usa SDK oficial, Groq usa httpx compatível com OpenAI. Configurar uma conta
gratuita sem billing e AI_FREE_TIER_CONFIRMED antes de habilitar as chamadas.
Sem chaves, a API principal preserva mensagens e turnos para retomar depois.
Não publicar a porta do Python na rede doméstica.

Detalhes, limites e instruções: [provedores](../../docs/ai/providers.md),
[orquestração](../../docs/architecture/ai-orchestration.md).

A partir da raiz: `pnpm python:sync`, `pnpm --filter @solo-rpg/ai-service dev`.
Testes: `pnpm --filter @solo-rpg/ai-service test`.
