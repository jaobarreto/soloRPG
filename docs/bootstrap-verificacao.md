# Verificação do bootstrap — 2026-10-30

- Node 24.17.0, pnpm 10.34.9, TypeScript 5.9.3, Next.js 16.4.3, React 19.3.1.
- NestJS 11.2.8, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11.
- Python 3.12.16, uv 0.13.6, FastAPI 0.162.0, Pydantic 2.14.2,
  Pydantic Settings 2.16.2, LangGraph 1.2.18 e Uvicorn 0.54.0.
- PostgreSQL 17.10 e pgvector 0.8.2 confirmados por consulta ao banco.

Passaram `pnpm install --frozen-lockfile`, `pnpm python:sync`, `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm build` e `pnpm format:check`.
A suíte contém 31 testes: 21 NestJS, 7 Python, 2 frontend e 1 contrato compartilhado.
Cobertura: 98,78% das linhas da API (83,33% dos ramos) e 90% das linhas Python.

O Compose com override local foi construído e executado com os quatro containers
saudáveis. O modo `pnpm dev` foi testado separadamente nas portas temporárias
3100/3101/8100 e encerrado, mantendo os containers nas portas 3000/3001/8000.
Os endpoints diretos e o proxy Next.js foram verificados por HTTP.

A indisponibilidade real do FastAPI retornou HTTP 503 tanto no NestJS quanto no
proxy Next.js. A parada do PostgreSQL também retornou HTTP 503, mantendo o health
básico da API em HTTP 200. Os serviços foram restaurados após essas verificações.
A migração foi reaplicada sem recriar objetos ou apagar dados.

A porta 5432 pertence a outro projeto; apenas o `.env` local usa porta 5433.
Banco e FastAPI estão publicados somente em loopback. Nenhuma chave de LLM foi usada.
O documento-base original foi preservado.

Limites da verificação: não havia navegador conectado para inspeção visual ou
execução de interações na página. O acesso a partir de outro dispositivo da LAN
depende da rede e do firewall locais e não foi exercitado.

A auditoria pnpm encontrou um aviso baixo sem correção publicada em `deepmerge`
transitivo do Jest (configuração de testes), sem avisos nas dependências de execução.
Referência: [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
As dependências transitivas corrigíveis apontadas pela auditoria foram fixadas por
overrides no manifesto raiz; revê-los quando os pacotes de origem forem atualizados.
ESLint 9 está depreciado, mas foi mantido por compatibilidade com os plugins do Next.js.
