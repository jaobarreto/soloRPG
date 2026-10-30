# SoloRPG

Base local para uma aplicação de RPG solo. O requisito principal está em
[docs/base-projeto.md](docs/base-projeto.md). Esta entrega inclui campanhas, sessões
com cronômetro pausável e chat persistente, além do Game Engine Blue Rose AGE da
Fase 3: personagens, dados, testes, combate básico e estado do mundo. O recorte
mecânico e suas pendências estão documentados abaixo; o Mestre por IA continua pendente.
A [arquitetura do domínio](docs/architecture/campaigns-and-sessions.md) descreve
contratos, concorrência e preservação do histórico.

## Stack e estrutura

- Node.js **24.17.0**, pnpm **10.34.9**, TypeScript **5.9.3** em modo strict.
- `apps/web`: Next.js **16.4.3**, App Router, React **19.3.1**, Tailwind **4.3.3**.
- `apps/api`: NestJS **11.2.8**, ConfigModule, Swagger, Drizzle ORM **0.45.4**, Drizzle Kit **0.31.11**, Jest.
- `apps/ai-service`: Python **3.12.16**, uv **0.13.6**, FastAPI, Pydantic v2,
  Pydantic Settings, LangGraph, Uvicorn, httpx, Ruff, mypy e pytest.
- PostgreSQL **17.10** com pgvector **0.8.2**, volume Docker persistente.
- `packages/shared-contracts`: health checks, enums, tipos e esquemas públicos de campanhas, sessões, mensagens e Game Engine, além do OpenAPI versionado.
- `packages/typescript-config`: configurações strict compartilhadas.
- `infrastructure/docker`: Dockerfiles de desenvolvimento.
- `docs/adr`: decisões arquiteturais; `docs/architecture`: domínio implementado; `docs/rules` e `rule-packs`: fontes, cobertura e limites das regras.

ESLint 9.39.5 foi mantido por compatibilidade dos plugins do Next.js com ESLint 9.

Versões transitivas exatas estão em `pnpm-lock.yaml` e `apps/ai-service/uv.lock`.
O Next.js usa Webpack no build e no desenvolvimento para funcionar também em ambientes
que restringem sockets auxiliares do Turbopack, mantendo hot reload.
A API compila com `tsc` e reinicia com `node --watch`, sem depender do Nest CLI.

shadcn/ui está preparado com aliases, `components.json`, variáveis CSS e `cn()`;
componentes serão adicionados conforme a necessidade.

## Pré-requisitos

Para o modo Docker: Docker Engine/Desktop em execução e Docker Compose v2 ou superior.
Para scripts `pnpm` e desenvolvimento no host: Node 24.17.0 e pnpm 10.34.9.
Para Python no host: uv; ele instala automaticamente Python 3.12 se necessário.
A instalação inicial precisa de internet; nenhuma conta de LLM é necessária.

Instale pnpm com Corepack (ou use `npm install --global pnpm@10.34.9`):

```bash
corepack enable
corepack prepare pnpm@10.34.9 --activate
pnpm --version
```

Instale uv seguindo a [documentação oficial](https://docs.astral.sh/uv/getting-started/installation/).
Em Linux/macOS, uma opção é:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Nesta máquina, pnpm e uv também foram instalados **apenas no projeto**, em `.tools/`
(ignorado no Git). Para usá-los no terminal atual:

```bash
export PATH="$PWD/.tools/node_modules/.bin:$PWD/.tools/bin:$PATH"
```

Esses arquivos locais não são necessários em outras instalações. O wrapper de uv
usa a instalação do projeto quando disponível e, em seguida, a do PATH.

## Início rápido — todos os serviços em Docker

A partir da raiz do repositório:

```bash
pnpm install --frozen-lockfile
pnpm setup:env
pnpm docker:local
```

`setup:env` cria `.env` com permissão `0600`, senha aleatória e `DATABASE_URL`
compatível, sem sobrescrever um arquivo existente. O comando `docker:local` usa
`docker-compose.local.yml` para também permitir diagnóstico Python e acesso ao banco
**somente em loopback**. As migrações são aplicadas automaticamente pelo container da API.

Para executar somente a Fase 2 (web, API e PostgreSQL), sem iniciar Python:

```bash
pnpm docker:game
# Equivalente:
docker compose up --build -d --wait web
```

Acesse:

- Campanhas: <http://localhost:3000/campaigns>.
- Ambiente local: <http://localhost:3000>.
- NestJS: <http://localhost:3001/api/v1/health>.
- FastAPI: <http://localhost:8000/health>.
- Swagger: <http://localhost:3001/api/v1/docs>.
- OpenAPI JSON: <http://localhost:3001/api/v1/docs-json>.

Para manter Python e PostgreSQL acessíveis apenas entre containers, use o Compose
principal, que publica somente frontend e API:

```bash
pnpm docker:up
```

Ao alternar os modos, use antes `pnpm docker:down`. Sem pnpm no host, os equivalentes são:

```bash
node scripts/setup-env.mjs
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d --wait
# ou, sem publicar FastAPI e PostgreSQL:
docker compose up --build -d --wait
```

Os Dockerfiles instalam as dependências dos respectivos serviços. Python/uv no host
não são necessários para usar apenas Docker.

Nesta máquina, a porta 5432 já pertence a outro projeto. O `.env` local usa
`POSTGRES_PORT=5433` e `DATABASE_URL` correspondente, sem alterar o serviço existente.

## Desenvolvimento no host

Não execute este modo junto com os containers `web`, `api` e `ai-service`, pois as
portas são as mesmas. Pare os containers com `pnpm docker:down` primeiro.

```bash
pnpm install --frozen-lockfile
pnpm setup:env
pnpm python:sync
pnpm db:up
pnpm db:migrate
pnpm dev
```

`pnpm dev` inicia os três aplicativos com hot reload; Ctrl+C encerra os três.
O banco continua no Docker. Para desenvolver só a Fase 2, use `pnpm dev:game` no
lugar de `pnpm dev`; Python não é necessário. `AI_SERVICE_URL` continua configurada
para preservar o diagnóstico opcional da Fase 1, sem chamadas nos fluxos de jogo.
Os comandos individuais são:

```bash
pnpm --filter @solo-rpg/shared-contracts build
pnpm --filter @solo-rpg/api dev
pnpm --filter @solo-rpg/web dev
pnpm --filter @solo-rpg/ai-service dev
```

No Compose, mudanças em `apps/api/src`, `apps/web/src` e `apps/ai-service/app` são
recarregadas automaticamente. Após alterar dependências ou configurações, reconstrua
com `pnpm docker:local` ou `pnpm docker:up`.

## Variáveis de ambiente

`.env.example` documenta todas as opções. Não versione `.env` e não coloque chaves
em variáveis `NEXT_PUBLIC_*`.

| Variável                                                             | Uso                                                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Credenciais locais e porta no host (padrão 5432); senha gerada por `setup:env`.                            |
| `DATABASE_URL`                                                       | NestJS/Drizzle no host; aponta para `127.0.0.1:5432`. No Compose é montada para `postgres:5432`.           |
| `API_HOST`, `API_PORT`                                               | Bind local da API e porta publicada (3001). Compose usa `0.0.0.0:3001` internamente e publica em loopback. |
| `AI_SERVICE_PORT`, `WEB_PORT`                                        | Portas no host: 8000 e 3000. Portas internas Docker permanecem 8000 e 3000.                                |
| `AI_SERVICE_URL`                                                     | NestJS → Python: `http://127.0.0.1:8000` no host, `http://ai-service:8000` no Compose.                     |
| `API_INTERNAL_URL`                                                   | Next.js → NestJS: `http://127.0.0.1:3001` no host, `http://api:3001` no Compose.                           |
| `NEXT_PUBLIC_API_URL`                                                | Base pública `/api/v1`; o proxy do Next encaminha `/api/v1/*` ao NestJS.                                   |
| `CORS_ORIGINS`                                                       | Lista de origens HTTP(S), separadas por vírgula; não aceita `*`.                                           |
| `HEALTH_TIMEOUT_MS`                                                  | Timeout de dependências no NestJS; padrão 3000 ms.                                                         |
| `MESSAGE_MAX_LENGTH`                                                 | Limite da API por mensagem; padrão 10.000 caracteres (1–100.000). A UI permite até 10.000.                 |
| `GEMINI_API_KEY`, `GROQ_API_KEY`                                     | Opcionais, apenas no serviço Python; podem ficar vazias.                                                   |
| `LLM_PROVIDER`                                                       | `gemini`, `groq` ou `ollama`; só configuração, sem chamadas nem fallback.                                  |
| `LOG_LEVEL`                                                          | Log do serviço Python; padrão `INFO`.                                                                      |

Se editar a senha manualmente, use caracteres seguros para URI ou faça percent-encoding
na `DATABASE_URL`. No Compose, prefira a senha hexadecimal gerada, pois a URL interna
é montada com as credenciais. Trocar o `.env` não troca a senha de um banco já
inicializado: altere a credencial no PostgreSQL e mantenha os valores sincronizados.

## Endpoints e saúde real

| Endpoint NestJS                 | Comportamento                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `GET /api/v1/health`            | Liveness: `{"status":"ok","service":"solo-rpg-api"}`.                            |
| `GET /api/v1/health/database`   | Executa `SELECT 1` via Drizzle; HTTP 503 se não conectar.                        |
| `GET /api/v1/health/ai-service` | Consulta `/health` no FastAPI com timeout e valida o contrato; HTTP 503 em erro. |

`GET /health` no FastAPI retorna `{"status":"ok","service":"solo-rpg-ai"}` sem
consultar provedores externos. Liveness da API não atesta prontidão das dependências;
use os endpoints específicos. O health check Docker da API consulta liveness e banco; Python é um diagnóstico opcional.
A página consulta os endpoints reais a cada 15 segundos e permite atualizar manualmente.

```bash
pnpm smoke
# Inclui o acesso direto ao Python quando o override local estiver ativo:
SMOKE_AI_DIRECT=1 pnpm smoke
```

Os contratos OpenAPI gerados são versionados em `packages/shared-contracts/openapi/`.
Com a API e o Python locais em execução, atualize-os com `pnpm contracts:export`.
Para atualizar apenas a API, sem abrir portas ou depender do Python, use `pnpm contracts:api`.

## Migrações e persistência

A migração `apps/api/drizzle/0000_enable_vector.sql` habilita `vector`.
`0001_campaigns_sessions_messages.sql` cria `campaigns`, `campaign_sessions` e
`session_messages`, enums, índices, checks e FKs, sem remover dados existentes.
Campanha e sessões são criadas na mesma transação; transições e envios concorrentes
usam locks no PostgreSQL. Não use `drizzle-kit push` no lugar das migrations.

```bash
pnpm db:migrate                      # PostgreSQL exposto no modo local
pnpm db:generate                     # Depois de mudar o schema Drizzle
# Migração customizada SQL, se necessária:
pnpm --filter @solo-rpg/api exec drizzle-kit generate --custom --name=nome
# Banco somente na rede Docker:
docker compose exec api pnpm --filter @solo-rpg/api db:migrate
# Verificar extensão:
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dx vector"'
```

O volume nomeado `solorpg_postgres_data` preserva os dados ao parar/recriar containers.
`pnpm docker:down` preserva esse volume. **`docker compose down -v` apaga o banco.**
Volume não substitui backup; antes de dados reais, configure backup e teste restauração.

## Qualidade e testes

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
pnpm test:integration              # PostgreSQL real e isolado, inclui unidades
pnpm --filter @solo-rpg/api test:coverage  # Mesma suíte com cobertura (>=80%)
node scripts/uv.mjs run pytest --cov=app --cov-report=term-missing
```

`pnpm test` cobre unidades e HTTP com dependências simuladas, incluindo a máquina de
estados, cronômetro e limites de mensagem. `pnpm test:integration` cria um container
PostgreSQL exclusivo, aplica migrations duas vezes e testa os endpoints com banco real:
planejamento, rollback, validação, transições, isolamento, paginação integral e
concorrência (20 mensagens simultâneas, start/complete duplicados e mensagem vs complete).
O cenário 5 + 3 mensagens verifica as oito originais depois de iniciar a sessão 2 e
reiniciar API e PostgreSQL. Container e volume de teste são removidos ao terminar;
o banco de desenvolvimento não é usado. Docker e sockets locais precisam estar disponíveis.
O log `request.failed` no cenário de falha injetada é esperado e verifica rollback.

`pnpm build` compila Next.js/NestJS/contratos e verifica sintaxe Python, sem exigir banco
ou chaves de LLM. Não há serviços pagos nos testes. A cobertura global da API exige
80% de statements, branches, funções e linhas, combinando unidades e integração.

## Campanhas, sessões e chat

Os novos módulos em `apps/api/src/{campaigns,sessions,messages}` têm controllers,
DTOs, services e repositories. O schema está em `apps/api/src/database/schema.ts`.
A interface usa as rotas `/campaigns`, `/campaigns/new`, `/campaigns/[campaignId]` e
`/campaigns/[campaignId]/sessions/[sessionId]`.

Todos os endpoints abaixo têm prefixo `/api/v1` e estão documentados no Swagger:

| Método | Rota                                                                   | Resultado                              |
| ------ | ---------------------------------------------------------------------- | -------------------------------------- |
| POST   | `/campaigns`                                                           | Cria campanha e todas as sessões (201) |
| GET    | `/campaigns`                                                           | Lista campanhas                        |
| GET    | `/campaigns/:campaignId`                                               | Campanha e sessões ordenadas           |
| PATCH  | `/campaigns/:campaignId`                                               | Edita somente título/descrição         |
| GET    | `/campaigns/:campaignId/sessions`                                      | Lista sessões                          |
| GET    | `/campaigns/:campaignId/sessions/:sessionId`                           | Detalhes e tempo ativo                 |
| POST   | `/campaigns/:campaignId/sessions/:sessionId/start`                     | Inicia sessão disponível               |
| POST   | `/campaigns/:campaignId/sessions/:sessionId/pause`                     | Pausa e acumula tempo                  |
| POST   | `/campaigns/:campaignId/sessions/:sessionId/resume`                    | Retoma sem contar a pausa              |
| POST   | `/campaigns/:campaignId/sessions/:sessionId/complete`                  | Encerra e libera a próxima             |
| POST   | `/campaigns/:campaignId/sessions/:sessionId/messages`                  | Salva mensagem PLAYER (201)            |
| GET    | `/campaigns/:campaignId/sessions/:sessionId/messages?after=0&limit=50` | Histórico paginado por sequência       |

Consultas, PATCH e transições retornam 200. Payload/UUID/cursor inválido retorna 400,
recurso ausente ou sessão de outra campanha retorna 404, conflito de estado retorna 409.
Propriedades desconhecidas são rejeitadas, incluindo `role` no envio de mensagens.

```bash
curl -X POST http://localhost:3001/api/v1/campaigns \
  -H 'Content-Type: application/json' \
  -d '{"title":"Os Ecos da Montanha","description":"Fantasia e mistério","plannedSessions":8,"defaultSessionDurationMinutes":120}'

# Substitua os UUIDs pelos retornados na criação:
curl -X POST http://localhost:3001/api/v1/campaigns/CAMPAIGN_UUID/sessions/SESSION_UUID/start
curl -X POST http://localhost:3001/api/v1/campaigns/CAMPAIGN_UUID/sessions/SESSION_UUID/messages \
  -H 'Content-Type: application/json' \
  -d '{"interactionMode":"SPEAK","content":"Theron, preciso conversar com você."}'
curl -X POST http://localhost:3001/api/v1/campaigns/CAMPAIGN_UUID/sessions/SESSION_UUID/pause
curl -X POST http://localhost:3001/api/v1/campaigns/CAMPAIGN_UUID/sessions/SESSION_UUID/resume
curl -X POST http://localhost:3001/api/v1/campaigns/CAMPAIGN_UUID/sessions/SESSION_UUID/complete \
  -H 'Content-Type: application/json' -d '{"endingType":"PLAYER_REQUESTED"}'
curl 'http://localhost:3001/api/v1/campaigns/CAMPAIGN_UUID/sessions/SESSION_UUID/messages?after=0&limit=50'
```

Novas campanhas começam `DRAFT`, com 8 sessões e duração de 120 minutos por padrão.
A sessão 1 fica `AVAILABLE`; as demais, `LOCKED`. O primeiro start ativa a campanha.
Só uma sessão pode estar em andamento ou pausada por campanha. Ao concluir, a próxima
planejada é liberada; a jogadora a inicia explicitamente. A última conclusão encerra
a campanha. Quantidade planejada e duração não podem ser alteradas depois da criação.

Modos de mensagem: `SPEAK`, `ACT`, `THINK`, `OUT_OF_CHARACTER`. Só `IN_PROGRESS`
aceita mensagens. Sessões pausadas e concluídas preservam todas as mensagens; as
concluídas são somente leitura. Não há endpoints de edição/exclusão de mensagens.
O histórico de cada sessão é independente: começar a próxima não copia nem altera
mensagens anteriores. Para recuperar todo o chat, use `after=nextCursor` enquanto
`hasMore=true`. A UI oferece “Carregar próximas mensagens”.

O relógio conta intervalos entre start/resume e pause/complete, sem limite rígido.
**Fechar o navegador não pausa automaticamente:** use o botão Pausar sessão.
Repetir uma transição já aplicada retorna 409 sem reaplicar seus efeitos; a UI
recarrega o estado em conflito. Mensagens não têm retry automático ou chave de
idempotência nesta fase. A tela final mostra título/tempo reais e os links para o
histórico e a próxima sessão, sem resumo fictício nem porcentagem narrativa.

## Rede doméstica

Com o frontend em execução, abra `http://IP-DA-MAQUINA:3000` em outro dispositivo da
mesma rede. Consulte o IPv4 com `hostname -I` no Linux. Libere a porta 3000 no firewall
somente para a LAN confiável. Como a base pública é relativa, o navegador não usa o
próprio `localhost` para acessar o backend. Banco e Python continuam fora da LAN.

Para acesso direto ao NestJS no navegador em outra origem, configure explicitamente
`CORS_ORIGINS` e o bind/porta; esse acesso não é necessário para a página inicial.
A Fase 2 não implementa autenticação, conforme o escopo da tarefa. Use a instalação
na rede doméstica confiável; o controle de acesso local do documento-base continua
pendente antes de disponibilizar a aplicação para terceiros.

## Operação e problemas comuns

```bash
docker compose ps
pnpm docker:logs
pnpm docker:down
```

- **Porta ocupada:** pare a execução anterior ou ajuste portas em `.env`. No host,
  atualize também `DATABASE_URL`, `AI_SERVICE_URL`, `API_INTERNAL_URL` e CORS se necessário.
- **Docker sem permissão:** confirme o daemon em execução e o acesso do seu usuário
  ao socket Docker conforme a instalação do sistema; reabra a sessão após ajustar grupos.
- **API falha na configuração:** execute `pnpm setup:env`; se `.env` já existe,
  revise `DATABASE_URL` e `AI_SERVICE_URL`. Os erros citam campos sem imprimir segredos.
- **Banco indisponível:** aguarde `docker compose ps` indicar `healthy`, confirme
  credenciais e execute migrações. No host, use `pnpm db:up` para publicar 5432 em loopback.
- **IA indisponível:** confirme `AI_SERVICE_URL` e o health check do container.
  A ausência de chave Gemini/Groq não impede inicialização.
- **Porta 8000 não responde no Compose principal:** é intencional; use o health check
  do NestJS ou reinicie com `pnpm docker:local` para publicar em loopback.
- **Dependência Python ausente:** execute `pnpm python:sync`; não use o Python 3.14
  do sistema para este projeto, que seleciona Python 3.12 via uv.
- **Instalação congelada falha após editar dependências:** execute `pnpm install`
  ou `uv lock` no diretório Python, revise e versione o lockfile resultante.

Referências técnicas: [Next.js](https://nextjs.org/docs/app/getting-started/installation),
[NestJS](https://docs.nestjs.com/first-steps), [migrações Drizzle](https://orm.drizzle.team/docs/migrations),
[uv em Docker](https://docs.astral.sh/uv/guides/integration/docker/).

Game Engine, personagens, estado do mundo e eventos estão descritos na Fase 3 abaixo,
preservando as fronteiras do domínio e o histórico integral. IA, Director, resumos e
detecção de inatividade serão implementados posteriormente.

## Fase 3 — Game Engine Blue Rose AGE

Abra **Ficha, dados e mundo** na campanha. Antes da primeira sessão, transcreva a
ficha da protagonista. O painel apresenta atributos, recursos, condições, inventário,
NPCs conhecidos, mundo, relacionamentos, rolagens, testes, combate e Curar. O chat
anterior permanece acessível e recebe mensagens de dados públicos.

Para executar no host, pare primeiro a web e a API do Docker, caso estejam rodando.
Isso libera as portas 3000 e 3001 e preserva o PostgreSQL e seus dados.

```sh
docker compose stop web api
pnpm db:up
pnpm db:migrate
pnpm dev:game
pnpm test:integration
pnpm --filter @solo-rpg/api test:coverage
pnpm contracts:api
pnpm --filter @solo-rpg/api engine:command /tmp/comando.json
```

O motor suporta 3d6/Drama Die, testes básicos/opostos/prolongados, focos, SP,
combate básico a pé nos níveis 1–2, cinco Stunts e Curar pela tradição de Cura fora
de combate, com fadiga. Armas/proteção/dano são calculados no servidor. O livro
brasileiro AGE 2023 disponível em `docs/references` foi consultado e permanece fora
do Git; a documentação registra páginas e limites. Criação/progressão completas,
demais poderes, ações, Stunts e arcanos continuam pendentes.

A CLI administrativa não abre portas. NPCs, relações, mundo, recursos, perfis e
pedidos secretos são administrados localmente. O browser não aceita dados oficiais,
dano, TN, modificadores ou comandos administrativos. A API pública permanece sem
autenticação, para uma jogadora numa instalação doméstica. Não há integração de
Mestre de IA ou dependência paga.

- [Arquitetura, entidades e API](docs/architecture/game-engine.md)
- [Comandos e execução](docs/architecture/blue-rose-engine.md)
- [Fontes e cobertura mecânica](docs/rules/blue-rose-implementation.md)
- [Mecânicas pendentes](docs/rules/blue-rose-pending-rules.md)
- [ADR 0004](docs/adr/0004-blue-rose-engine-e-fronteira-local.md)
