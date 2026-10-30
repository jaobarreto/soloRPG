# Serviço de IA

O endpoint `/health` independe de chaves externas. Configuração em `app/core/config.py`;
contrato futuro em `app/providers/base.py`. Nenhum adaptador faz chamadas nesta etapa.

LangGraph está instalado para a próxima etapa de orquestração. Os grafos só serão
criados quando houver um fluxo concreto; não existe estado de campanha neste serviço.

A partir da raiz: `pnpm python:sync`, `pnpm --filter @solo-rpg/ai-service dev`.
Testes: `pnpm --filter @solo-rpg/ai-service test`.
