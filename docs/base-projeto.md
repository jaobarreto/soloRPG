# Solo RPG — Documento-base do projeto

> **Status:** especificação inicial (v0.1) · **Público:** uso pessoal, uma jogadora · **Execução:** rede doméstica · **Meta de serviços:** R$ 0/mês, respeitando limites gratuitos de APIs externas.
>
> Este documento define a visão, a stack, os limites do MVP, a arquitetura, os contratos e as regras de negócio. É uma referência viva: decisões alteradas devem ser registradas em `docs/adr/`.

## 1. Visão e proposta

Aplicação web de **RPG solo por chat**, com um Mestre de RPG apoiado por LLM. A jogadora interpreta exclusivamente a protagonista; o Mestre descreve o mundo, representa NPCs, consulta regras, solicita testes, acompanha objetivos e conduz encerramentos de sessões sem retirar a agência da jogadora.

A campanha é dividida em um **número planejado de sessões**, cada uma com chat próprio, objetivo narrativo e meta de duração de **120 minutos de atividade**. Ao finalizar uma sessão, a jogadora vê um resumo e pode iniciar a próxima em **novo chat**. **Todo o chat anterior permanece salvo e consultável, mensagem por mensagem, com suas rolagens e acontecimentos**, mesmo após a campanha terminar. O estado do mundo e as memórias atravessam as sessões.

### Princípios inegociáveis

1. **A jogadora controla a protagonista.** A IA não inventa falas, escolhas, pensamentos ou ações voluntárias dela. Efeitos involuntários são permitidos apenas se previstos pelo sistema ou pela ficção validada.
2. **O backend mantém a verdade.** O LLM propõe; o Game Engine valida e persiste fatos, atributos, itens, dados, relacionamentos, progressão e encerramentos.
3. **Não há informação secreta no cliente.** Segredos de campanha, planos privados, resultados de dados do Mestre e conhecimento exclusivo de NPCs ficam no servidor.
4. **Uma sessão é um capítulo, não um reset.** O chat é separado, mas campanha, mundo, personagem e relacionamentos continuam.
5. **Tempo orienta; não obriga.** A duração-alvo não autoriza forçar escolhas, inventar vitórias ou concluir um objetivo sem evidência.
6. **Gratuidade por padrão.** Não configurar cobrança automática, fallback pago ou serviços gerenciados necessários ao MVP. API externa gratuita é limitada e pode mudar; prever pausa graciosa quando a cota acabar.
7. **Regras mecânicas são determinísticas.** Cálculos e lançamentos de dados ocorrem no servidor; o LLM nunca fornece o resultado oficial.
8. **Persistência verificável.** A ação só pode ser considerada consolidada depois de confirmada no banco; requisições repetidas não aplicam eventos duas vezes.

## 2. Escopo

### 2.1 MVP obrigatório

- Uma jogadora, uma instalação doméstica e uma campanha ativa por vez (o modelo de dados deve permitir várias no futuro).
- Cadastro/edição de campanha, protagonista, NPCs, ambientação, estilo narrativo e Story Cards.
- Planejamento de quantidade de sessões, objetivos, marcos e duração-alvo de 120 minutos.
- **Chat persistente por sessão**, ordenado cronologicamente, recuperável integralmente, inclusive após encerramento; com paginação e navegação entre sessões.
- Modos de mensagem: **Falar**, **Fazer**, **Pensar** e **Fora do RPG (OOC)**.
- Mestre narrativo via API de LLM com plano gratuito; seleção de provedor por configuração e fallback *somente* para outro provedor gratuito ativado.
- Memória básica: estado de cena, eventos, histórico e relacionamento dos NPCs com a protagonista, respeitando conhecimento individual.
- Rolar dados no servidor; exibir animação no frontend; não revelar rolagens secretas.
- Um Rule Pack inicial **concreto, de versão definida**, com testes mecânicos mais comuns; sem promessa de suporte completo a todos os livros.
- Director com objetivo da sessão, condições de conclusão e indicação de momento narrativo apropriado para o fim.
- Pausar/retomar, encerrar sessão, resumir, visualizar tela final e iniciar próximo chat.
- Diário/resumo por sessão e barra de progresso da campanha baseada em marcos.
- Execução local via Docker Compose, acessível por outro dispositivo na rede doméstica.
- Testes básicos, logs e backup local do banco.

### 2.2 Pós-MVP

Combate completo; vários Rule Packs; fichas configuráveis; memória semântica com embeddings locais; reputação por facções; rotinas e calendário de NPCs; calendário do mundo; eventos agendados; inventário elaborado; ramificações avançadas; mapas; retratos; áudio; exportação/importação de saves; checkpoints com restauração; painel administrativo visual; publicação para terceiros. **Não antecipar** infraestrutura dessas funções sem benefício demonstrado.

### 2.3 Fora do escopo inicial

Multiplayer, pagamentos, assinatura, moderação comunitária, treinamento/fine-tuning próprio, várias IAs independentes em conversação contínua, execução de modelos grandes locais, sincronização em nuvem, aplicativo mobile nativo e alta disponibilidade.

## 3. Stack e decisões iniciais

| Camada | Escolha | Justificativa |
|---|---|---|
| Frontend | Next.js (React, TypeScript) | Interface responsiva e navegação por sessões |
| UI | Tailwind CSS + shadcn/ui | Componentes simples e personalizáveis |
| Animação de dados | CSS/React; Motion opcional | Animação é apresentação, não fonte do resultado |
| Backend principal | **NestJS (TypeScript)** | Regras de negócio, autorização e API |
| Validação backend | class-validator/Zod, conforme convenção adotada | Contratos tipados e consistência |
| Persistência | **PostgreSQL local** | Transações, relacionamentos e JSONB quando necessário |
| ORM/migrações | **Drizzle ORM + Drizzle Kit** | Tipagem e migrações versionadas |
| Serviço de IA | **Python + FastAPI** | Montagem de contexto e orquestração |
| Orquestração | LangGraph | Fluxos retomáveis; usar apenas quando necessário |
| Estruturas IA | Pydantic | Validar proposta de ação e formato de saída |
| Provedor de LLM | Adaptador `LLMProvider` (Gemini/Groq ou outro tier gratuito elegível) | Evitar acoplamento a modelos e cotas mutáveis |
| Embeddings | Não obrigatório no MVP; pgvector + modelo local depois | Evitar complexidade e gastos antecipados |
| Streaming | SSE | Respostas progressivas para o navegador |
| Infra | Docker Compose | Serviços na máquina host |
| Arquivos | Volume local | Story Cards, documentos e backups |
| Testes | Vitest/Jest (TS), pytest (Python), Playwright (E2E opcional) | Verificar mecânicas e fluxos |

**Não usar Supabase Cloud, Redis, RabbitMQ, banco vetorial separado ou autenticação terceirizada como dependência do MVP.** PostgreSQL local é suficiente. Rede doméstica não significa segurança automática: proteger API, portas e arquivos de configuração. A gratuidade de Gemini, Groq ou alternativas depende das condições vigentes; confirmar modelo, disponibilidade, limites e política de dados antes da integração. Não fixar nomes de modelos não verificados no código.

### Regras para o provedor de IA

- Implementar `generateStructured`, `generateText` e, quando suportado, `streamText` por uma interface comum.
- Chaves somente no backend/serviço de IA; nunca no browser ou repositório.
- Definir limite de tokens de saída e controlar tamanho do contexto.
- Usar retry limitado com backoff apenas para falhas transitórias, preservando idempotência da ação.
- Em `429`/cota esgotada: exibir aviso, salvar a mensagem pendente e permitir tentar novamente; **nunca cobrar automaticamente**.
- Preferir uma chamada estruturada por turno normal; rolagens ou ações ambíguas podem exigir etapas extras.
- Logar tokens/latência/erros, sem registrar chaves ou segredos nos logs.
- Conteúdo enviado a LLM externo deixa o ambiente doméstico: informar isso nas configurações.

## 4. Arquitetura de alto nível

```text
 Navegador (Next.js)
       | REST para ações/consulta; SSE para narrativa
       v
  NestJS — API + Game Engine (autoridade)
       |                    |
       | SQL transacional   | chamada interna tipada
       v                    v
 PostgreSQL             FastAPI — AI Orchestrator
  - campaigns              - Intent / Director
  - sessions               - Context builder
  - messages               - Narrator
  - game_events            - Output schemas
  - world_state                  |
  - relationships                v
  - dice_rolls              LLM gratuito (internet)
```

**Fluxo de uma ação:**

1. Next.js envia `actionId` (UUID/idempotency key), `sessionId`, `mode` e texto ao NestJS.
2. NestJS autentica/autoriza localmente, verifica status da sessão, salva mensagem da jogadora e cria ação `PENDING`.
3. NestJS carrega estado oficial, personagens presentes, objetivos, regras e memórias relevantes; passa **visões autorizadas** ao FastAPI.
4. FastAPI identifica intenção, sugere necessidade de teste e/ou efeitos e gera narrativa estruturada. Texto recebido do jogador/documentos é **dado não confiável**, nunca instrução de sistema.
5. Se precisar de dado público: backend cria `roll_request`, marca ação `AWAITING_ROLL` e aguarda a jogadora. Se dado secreto: backend executa sem revelar resultado.
6. NestJS executa mecânicas, valida precondições e efeitos propostos e persiste eventos/estado em transação; ação passa a `COMMITTED`.
7. Narrativa validada é gravada como mensagem do Mestre antes de ser marcada como entregue; SSE transmite texto/estado final. Em falha de SSE, cliente recarrega histórico sem duplicar efeitos.
8. Rotinas de finalização/resumo são independentes e idempotentes; erros não apagam a sessão ou o chat.

**Limite de responsabilidade:** FastAPI não faz `UPDATE` direto em entidades centrais. Sempre solicita alterações via contrato; NestJS aceita/rejeita. O Python pode ser stateless no MVP: a memória persistente vive no PostgreSQL.

### Estrutura de monorepo

```text
solo-rpg/
├── apps/
│   ├── web/                  # Next.js
│   ├── api/                  # NestJS
│   │   └── src/
│   │       ├── campaigns/
│   │       ├── sessions/
│   │       ├── messages/
│   │       ├── game-engine/
│   │       ├── characters/
│   │       ├── memories/
│   │       ├── relationships/
│   │       ├── world-state/
│   │       ├── rule-packs/
│   │       ├── dice/
│   │       ├── progression/
│   │       └── ai-gateway/
│   └── ai-service/           # FastAPI/Python
│       ├── app/api/
│       ├── app/graph/
│       ├── app/director/
│       ├── app/narrator/
│       ├── app/context/
│       ├── app/providers/
│       ├── app/schemas/
│       └── tests/
├── packages/
│   └── contracts/            # Esquemas OpenAPI/JSON Schema gerados/versionados
├── rule-packs/               # Arquivos declarativos e documentação autorizada
├── storage/                  # Mount local; ignorado no Git
├── infrastructure/
│   └── docker/
├── docs/
│   ├── adr/
│   └── examples/
├── docker-compose.yml
├── .env.example
└── base-projeto.md
```

## 5. Modelo de domínio e dados

### 5.1 Entidades principais

| Entidade | Campos ou relação-chave |
|---|---|
| `campaigns` | id, title, synopsis, status, `planned_sessions`, current_session_number, rule_pack_id, config JSONB |
| `campaign_sessions` | id, campaign_id, session_number, title, status, target_duration_minutes=120, active_duration_seconds, started_at, ended_at, ending_reason, summary |
| `session_objectives` | id, session_id, description, hidden, required, status, completion_criteria JSONB |
| `story_milestones` | id, campaign_id, weight, visibility, status, completed_at |
| `characters` | id, campaign_id, kind (`PLAYER`/`NPC`), name, public_card, private_card, current_state |
| `character_sheets` | character_id, rule_pack_version, stats JSONB |
| `character_relationships` | campaign_id, from_character_id, to_character_id, affinity, trust, hostility, notes |
| `game_events` | id, campaign_id, session_id, action_id, type, payload JSONB, created_at, visibility |
| `character_knowledge` | character_id, event_id, source, certainty, learned_at |
| `character_memories` | id, character_id, event_id, salience, personal_interpretation |
| `world_entities` | id, campaign_id, kind (location/object/faction), canonical_state JSONB |
| `messages` | id, campaign_id, session_id, action_id?, sequence_number, role, mode?, content, visibility, created_at, metadata JSONB |
| `player_actions` | id, session_id, idempotency_key UNIQUE, status, input, created_at, resolved_at |
| `dice_rolls` | id, session_id, action_id, expression, faces/rolls, modifiers, total, visibility, reason, created_at |
| `rule_packs` | id, system, edition, pack_version, config |
| `rule_documents` | id, pack_id, title, source, storage_path, visibility |

**Campos críticos:** constraints únicas `UNIQUE(campaign_id, session_number)` e `UNIQUE(session_id, sequence_number)`; índices em `(session_id, sequence_number)` e `(campaign_id, created_at)`; chaves estrangeiras e exclusão em cascata **com cuidado** — não apagar chats por acidente. IDs UUID são recomendados.

### 5.2 Chat completo e histórico permanente por sessão

Esta é uma **regra de negócio obrigatória**:

- Cada sessão tem **um chat próprio**, identificado por `session_id`.
- Todas as mensagens **da jogadora e do Mestre** são armazenadas integralmente, com ordem estável e timestamp.
- Mensagens dos modos Falar, Fazer, Pensar e OOC mantêm seu tipo original.
- Pedidos de rolagem e resultados públicos são itens associados à linha do tempo, renderizados junto das mensagens. Rolagens secretas **não** aparecem nas respostas do endpoint da jogadora.
- **Encerrar uma sessão não deleta, arquiva inacessivelmente, resume em substituição nem sobrescreve seu chat.** O resumo complementa o histórico integral.
- A jogadora pode abrir qualquer sessão anterior e rolar o chat desde a primeira interação, **somente leitura** se `COMPLETED`.
- Navegação: lista de sessões da campanha → abrir sessão 1 → consultar histórico → voltar → abrir sessão 2. A navegação não muda o estado atual da campanha.
- O histórico é paginado por cursor/`sequence_number` para não carregar centenas de mensagens de uma vez; a UI oferece “carregar anteriores” e rolagem contínua.
- Mensagem em streaming deve resultar em **um único registro definitivo**, jamais duplicar texto ao reconectar.
- Mensagem OOC não cria eventos do mundo automaticamente.
- Edição de mensagens antigas não é permitida no MVP; correções geram novo evento/retificação vinculada ao original. Evitar quebra de causalidade.
- O diário/resumo mostra acontecimentos relevantes e a progressão; **não substitui** a transcrição completa.

### 5.3 Estado do mundo x memória x conhecimento

- **Estado canônico:** fatos existentes no mundo (porta trancada, taverna destruída, inventário, localização etc.).
- **Evento:** mudança/acontecimento ocorrido com causalidade, participantes e fonte.
- **Memória:** interpretação e importância pessoal de um evento para um NPC.
- **Conhecimento:** se e como aquele NPC soube do evento (viu, ouviu, rumor). Personagens não são oniscientes.
- **Resumo:** compactação para contexto de LLM, **nunca** a fonte única de verdade.

No MVP, recuperar por chaves relacionais e relevância explícita. Adicionar pgvector quando testes demonstrarem necessidade de encontrar eventos semanticamente distantes.

## 6. Sessões e regras de negócio

### 6.1 Campanha

- Na criação, autor define nome, tom, sistema/edição, protagonista, contexto, número **planejado** de sessões e objetivo geral.
- Sessões futuras podem ter título/objetivo ocultos para prevenir spoilers. Admin vê plano, jogadora vê apenas o permitido.
- `planned_sessions` é a meta de estrutura; não pode justificar violação de agência. Se o rumo desviar, Director pode propor adaptação e o criador aprova mudanças estruturais (MVP: por configuração/admin).
- Progresso = `100 × soma(pesos dos marcos concluídos) / soma(pesos dos marcos planejados)`. Não usar contagem de mensagens nem simplesmente `sessões concluídas / total` como progressão da história.

### 6.2 Estados da sessão

```text
LOCKED → AVAILABLE → IN_PROGRESS ↔ PAUSED
                         |
                         v
                    FINALIZING → COMPLETED
```

- Apenas uma sessão da mesma campanha pode estar `IN_PROGRESS` ou `FINALIZING` por vez.
- Primeira sessão começa `AVAILABLE`; próxima só é liberada após a anterior atingir `COMPLETED`.
- `PAUSED`: continua **o mesmo chat** ao retomar.
- `COMPLETED`: chat imutável e consultável; botões “Ver chat completo”, “Ver resumo” e “Iniciar sessão seguinte”.
- A próxima sessão cria **novo chat e novas mensagens**, mas lê estado, eventos e memórias da campanha.
- A última sessão concluída marca campanha `COMPLETED` e permite epílogo.
- Falha de resumo ou indisponibilidade do LLM não pode apagar histórico nem duplicar encerramento; usar `FINALIZING` recuperável.

### 6.3 Encerramento e duração

- Duração-alvo: **120 minutos de jogo ativo**, desconsiderando pausas e desconexão/inatividade conforme regra do cronômetro definida na implementação.
- Cronômetro mede atividade, não “tempo desde started_at”; não cria conclusão automática ao completar 120 minutos.
- Director avalia `objetivo`, `evidências`, `ritmo`, `tempo`, `ponto dramático` e `decisões da jogadora`.
- Encerramentos: `OBJECTIVE_COMPLETED`, `NARRATIVE_PAUSE`, `PLAYER_REQUESTED`; registrar razão e evidências.
- Critérios concluídos devem ser verificados por eventos/estado, não apenas alegação do LLM.
- Desvios são permitidos: sessão pode fechar em um gancho sem cumprir o objetivo; objetivo pendente pode ser transferido ou abandonado com justificativa.
- Finalização: persistir último resultado → consolidar estado/eventos → gerar resumo/diário → `COMPLETED` → liberar próxima. Toda etapa deve tolerar repetição.
- **Nunca iniciar outra sessão automaticamente.** A jogadora clica “Iniciar sessão N+1”.

### 6.4 Transição de chat

Após a cena final, renderizar tela com número/título, resumo sem segredos, acontecimentos, tempo jogado, progresso e botão **Iniciar sessão 2**. O chat anterior continua acessível na lista. O início da sessão seguinte pode se dar **no mesmo instante do mundo**, sem salto temporal compulsório. O backend injeta estado canônico, resumo anterior, relacionamentos, conhecimento permitido e plano da nova sessão no contexto do Mestre.

## 7. Modos de interação e fronteira OOC

| Modo | Semântica |
|---|---|
| `SPEECH` (Falar) | Fala voluntária da protagonista dentro da ficção |
| `ACTION` (Fazer) | Tentativa de ação; Mestre descreve resultado ou pede teste |
| `THOUGHT` (Pensar) | Pensamento/observação interna, **não audível** por NPCs por padrão |
| `OOC` (Fora do RPG) | Dúvidas, regras e pedidos de ajuste; não avança tempo nem estado automaticamente |

- O narrador nunca decide uma ação voluntária pela protagonista.
- Respostas encerram em ponto de decisão relevante; evitar jogar várias cenas sem intervenção.
- OOC pode consultar o sistema, mas não deve revelar spoilers ou segredos do Mestre.
- Correções de interpretação precisam de mecanismo explícito de retificação; não reescrever o passado silenciosamente.

## 8. Rule Packs e rolagem

**Rule Pack** = versão identificada de um sistema, separando: (a) regras mecânicas executáveis no NestJS; (b) referência documental consultável pela IA; (c) termos, fichas e testes pertinentes.

Contrato conceitual:

```ts
interface RulePack {
  id: string;
  system: string;
  edition: string;
  version: string;
  validateCharacterSheet(sheet: unknown): ValidationResult;
  evaluateCheck(input: CheckInput): CheckDefinition;
  resolveCheck(input: CheckDefinition, roll: DiceRoll): CheckResult;
}
```

- Começar com **um Rule Pack e um conjunto delimitado de testes**; documentar mecânicas ainda não implementadas.
- O backend gera aleatoriedade com fonte criptograficamente segura e calcula modificadores, dificuldades e consequências mecânicas.
- A animação de dados representa resultados já definidos no servidor.
- Visibilidade: `PUBLIC`, `PLAYER_ONLY`, `GM_ONLY`; filtrar **no endpoint**, não apenas por CSS.
- Quando a jogadora precisar rolar, a ação aguarda `AWAITING_ROLL`; ela clica no dado; backend resolve e retoma a narração.
- Regras/documentos importados precisam ter licença ou direito de uso/distribuição compatível; não incluir livros comerciais no repositório público.

## 9. Director e fluxo da IA

Não iniciar com sete agentes independentes. Começar com **um fluxo** contendo papéis lógicos:

1. `intent`: interpretar modo e intenção.
2. `context`: montar contexto relevante sem segredos indevidos.
3. `rules`: verificar se há mecânica/rolagem.
4. `director`: acompanhar objetivo, tempo e ponto narrativo.
5. `narrator`: gerar resposta temática sem controlar protagonista.
6. `effects`: propor eventos/relacionamentos/conclusões em estrutura validada.
7. `validator`: validar estrutura, permissões, consistência e referências.

**Saída ilustrativa:**

```json
{
  "narrative": "Theron desvia o olhar antes de responder...",
  "requiresRoll": false,
  "proposedEvents": [
    {"type": "NPC_INTERACTION", "npcId": "npc_theron", "summary": "Conversa tensa"}
  ],
  "sessionSuggestion": {"readyToEnd": false, "reason": null}
}
```

Os eventos propostos **não são aplicados automaticamente sem validação**. Para minimizar custo, combinar etapas numa chamada estruturada quando seguro; chamadas adicionais apenas em testes, falhas de formato ou necessidade narrativa. Fazer uso de regras estruturadas e recuperação seletiva de contexto para evitar enviar o histórico integral ao LLM.

### Política de contexto

**Sempre incluir:** regras centrais da personagem e campanha, estado de cena, metas ativas, fatos críticos, NPCs presentes e memória crítica associada. **Quando relevante:** resumo prévio, conhecimento por NPC, eventos relacionados e histórico recente. **Não incluir:** documentos inteiros, todas as conversas anteriores, segredos não pertinentes à execução. O chat integral continua no banco para consulta humana, não para ser integralmente reenviado ao modelo.

## 10. API inicial (contratos sugeridos)

```http
POST   /campaigns
GET    /campaigns/:campaignId
GET    /campaigns/:campaignId/sessions
POST   /campaigns/:campaignId/sessions/:sessionId/start
POST   /campaigns/:campaignId/sessions/:sessionId/pause
POST   /campaigns/:campaignId/sessions/:sessionId/resume
GET    /campaigns/:campaignId/sessions/:sessionId
GET    /campaigns/:campaignId/sessions/:sessionId/messages?before=<cursor>&limit=50
POST   /campaigns/:campaignId/sessions/:sessionId/actions
POST   /campaigns/:campaignId/sessions/:sessionId/rolls/:rollRequestId/resolve
POST   /campaigns/:campaignId/sessions/:sessionId/finalize
POST   /campaigns/:campaignId/sessions/next
GET    /campaigns/:campaignId/events
GET    /campaigns/:campaignId/progress
GET    /campaigns/:campaignId/characters
GET    /health
```

- `GET .../messages` deve retornar **todas as mensagens visíveis da sessão histórica**, paginadas, independentemente do status.
- `GET .../messages` **não modifica** `current_session` nem reinicia sessão.
- `POST .../actions` exige `idempotencyKey`; proíbe ações novas em sessão `COMPLETED`.
- `GET .../sessions` expõe apenas títulos/objetivos liberados à jogadora.
- SSE pode ser recurso em `GET /actions/:actionId/stream` e deve permitir reconexão sem reexecutar a ação.
- Separar DTO de administração/segredos de DTO da jogadora; **nunca devolver `private_card` no endpoint público**.

**Formato de mensagem:**

```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "sequenceNumber": 42,
  "role": "ASSISTANT",
  "mode": null,
  "content": "A entrada da caverna aparece entre as árvores...",
  "createdAt": "2026-10-30T18:30:00Z",
  "metadata": {"relatedRollIds": [], "eventIds": ["uuid"]}
}
```

## 11. UX mínima

**Tela da campanha:** nome, sistema, capítulo atual, número de sessões planejadas, progresso e lista de sessões (concluídas, em andamento e futuras com spoiler protegido).

**Tela da sessão:** histórico completo da sessão, rolagens públicas intercaladas, caixa de texto, seletor de modo, botão de pausa, identificação “Sessão X de Y”, duração ativa e controle de dados.

**Tela pós-sessão:** “Fim da Sessão X”, resumo, acontecimentos, tempo ativo, progresso, botão **Ver chat completo da Sessão X** e botão **Iniciar Sessão X+1**.

**Sessões anteriores:** abrir chat em **somente leitura**; rolar todo histórico, inclusive falas, ações, pensamentos, OOC e dados públicos; voltar ao chat atual sem perder posição ou alterar o estado.

**Avisos:** exibir erro recuperável se cota de IA terminar; nunca perder texto já salvo. Não revelar meta secreta ou dados do Mestre na UI, nos logs do navegador ou nas respostas HTTP.

## 12. Segurança, privacidade e confiabilidade

- API exposta apenas na LAN; não publicar portas do banco ou FastAPI externamente. Restringir bind/firewall quando possível.
- Mesmo com uma jogadora, usar **token de acesso local ou senha simples** para evitar alterações por qualquer dispositivo da rede.
- CORS limitado às origens permitidas; segredos e `.env` ignorados no Git.
- Validar payloads, impor limites de tamanho, rate limit local e autenticar SSE.
- Tratar uploads e textos de campanha como dados não confiáveis; prevenir prompt injection contra ferramentas administrativas.
- `GM_ONLY` e cartas privadas não saem da camada servidora para cliente da jogadora.
- Backup periódico de PostgreSQL e dos arquivos locais, com teste ocasional de restauração. **Persistência no volume Docker não substitui backup**.
- Não armazenar necessariamente raciocínio interno do modelo; armazenar somente propostas, eventos, mensagens e metadados necessários à auditoria.
- Distinguir custo de serviços (alvo R$ 0) de custo de energia/internet e risco de mudanças nas cotas de API.

## 13. Estratégia de testes e critérios de aceite

### Testes de domínio

- Sessão 2 não inicia antes da 1 ser `COMPLETED`.
- Pausar e retomar mantém **o mesmo chat** e não conta o intervalo de pausa.
- Ao encerrar sessão 1, `messages` permanece intacta e ordenada; consultar o chat completo após iniciar sessão 2 funciona.
- Nova sessão cria chat vazio/próprio, mas compartilha estado e memórias da campanha.
- `GET` de sessão antiga nunca altera sessão atual.
- Reenvio da mesma ação não duplica mensagens, eventos ou consumo de itens.
- Rolagens secretas não aparecem em responses públicas ou streams.
- OOC não altera estado narrativo.
- Progresso muda apenas com marcos validados.
- LLM indisponível preserva ações/mensagens já persistidas e permite retomar.

### Testes narrativos (avaliação com cenários)

- NPC mantém desconfiança após conflito de sessões anteriores.
- NPC sem acesso a um segredo não o menciona como fato conhecido.
- Jogadora pode desviar do objetivo sem teletransporte de pistas ou decisão forçada.
- IA não escreve falas nem escolhas voluntárias da protagonista.
- Encerramento sugerido tem evidência narrativa, não apenas duração.
- Primeira mensagem da sessão 2 respeita localização, estado e acontecimentos finais da sessão 1.

### Critério de conclusão do MVP

Uma campanha de teste com **2 sessões** pode ser jogada do começo ao fim: sessão 1 dura o tempo desejado, é encerrada, mostra resumo e botão para a próxima; a sessão 1 continua integralmente legível, e a sessão 2 inicia em um novo chat mantendo o mundo, os NPCs e suas consequências. Dados, progressão, pausas e limites gratuitos são tratados sem corromper o histórico.

## 14. Plano de implementação

### Etapa A — Fundação

- [ ] Criar monorepo e apps Next.js, NestJS, FastAPI.
- [ ] Criar `docker-compose.yml` com PostgreSQL e volumes persistentes.
- [ ] Configurar Drizzle, migrações, `.env.example`, lint, format, testes e healthchecks.
- [ ] Criar schemas compartilhados/contratos OpenAPI e separar DTO admin/jogadora.

### Etapa B — Campanhas, sessões e chat persistente

- [ ] Criar tabelas e endpoints de campanhas/sessões/mensagens/ações.
- [ ] Criar cronômetro pausável, máquina de estados e regras de autorização.
- [ ] Construir chat com modos e histórico por sessão, paginação e leitura de sessões antigas.
- [ ] Testar que encerramento não apaga mensagem e que próxima sessão tem chat separado.

### Etapa C — Mestre e mundo

- [ ] Criar `LLMProvider` para ao menos um tier gratuito.
- [ ] Implementar FastAPI, prompts centrais e saída estruturada com Pydantic.
- [ ] Implementar estado de cena, NPCs, relacionamentos e eventos persistidos.
- [ ] Gerar narrativas sem controle da protagonista, com recuperação de contexto.

### Etapa D — Regras e diretor

- [ ] Implementar um Rule Pack mínimo e rolagem segura no NestJS.
- [ ] Implementar objetivos e progressão por marcos.
- [ ] Implementar Director e encerramento idempotente com resumo.
- [ ] Construir tela final e botão de próximo chat.

### Etapa E — Qualidade e operação doméstica

- [ ] Testar duas sessões completas, inclusive falhas de conexão e limite de API.
- [ ] Filtrar segredos no backend, adicionar acesso local e revisar exposição de portas.
- [ ] Criar scripts de backup/restauração e instruções de uso na LAN.
- [ ] Medir latência, tokens por turno e qualidade narrativa; só então ampliar funcionalidades.

## 15. Primeiras tarefas técnicas sugeridas

1. Inicializar o monorepo e o ambiente Docker com PostgreSQL.
2. Definir modelos Drizzle e criar as migrações para `campaigns`, `campaign_sessions`, `messages`, `player_actions`, `game_events`.
3. Implementar endpoints de listagem, criação de sessão e **recuperação integral/paginada do histórico**, antes de conectar a IA.
4. Criar UI mínima da lista de sessões + chat persistente + leitura de chat antigo.
5. Adicionar FastAPI, um provider gratuito e uma narração de ponta a ponta.
6. Introduzir estado do mundo, NPCs, objetivos, rolagem e finalização.

## 16. Decisões pendentes (não bloqueantes)

- **Rule Pack inicial:** escolher sistema, edição e escopo licenciado (sugestão: Blue Rose, com apenas mecânicas necessárias para a campanha-piloto).
- **Modelo e cota de LLM:** validar disponibilidade gratuita no momento da implementação; ter fallback gratuito configurável.
- **Pausa por inatividade:** definir detecção de atividade (ex.: heartbeat + timeout), sem contar como jogo o navegador esquecido aberto.
- **Administração:** inicialmente por seed/configuração/rota protegida; UI de autoria depois.
- **Resumo de encerramento:** decidir quando refazer em caso de falha sem duplicar finalização.
- **Sessões planejadas:** permitir ajuste administrativo se a história divergir, sem expor spoilers e sem recalcular progresso de modo surpreendente.

---

## Regra síntese

> **Um chat por sessão, histórico integral para sempre enquanto a campanha existir; memória e mundo compartilhados entre sessões; Mestre improvisa, Game Engine valida; a jogadora decide; nenhuma dependência de serviço pago no MVP.**