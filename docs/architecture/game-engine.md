# Game Engine — Fase 3

NestJS é a autoridade mecânica; PostgreSQL local persiste o estado. Nenhuma IA ou
serviço pago é necessário. O recorte exclusivo Blue Rose AGE inclui fichas, testes,
combate básico, cinco Stunts e Curar. [Mecânicas e fontes](../rules/blue-rose-implementation.md),
[limites](../rules/blue-rose-pending-rules.md), [comandos](blue-rose-engine.md).

## Componentes

- `blue-rose`: RNG e regras puras; serviços específicos de combate, testes e arcanos.
- `game-engine`: entrada de comandos, validação, coordenação transacional, recibos,
  auditoria, controller público e CLI. Os serviços recebem contexto transacional e
  callbacks de gravação; não escrevem por uma conexão independente.
- `characters/characters.service.ts`: projeções públicas explícitas de ficha, rolagens,
  eventos e mundo. Não consulta `character_secrets` para responder HTTP.
- `database/game-schema.ts`: tabelas novas, reutilizando campanhas e sessões existentes.
- `shared-contracts/src/game.ts`: schemas públicos estritos e tipos de resposta. Os
  schemas administrativos existem apenas no código da API.
- `web/.../game`: ficha, dados, inventário, combate, arcanos, mundo, NPCs e relacionamentos.
  O chat da Fase 2 continua na sua própria rota e recebe mensagens de dados públicos.

O cadastro público transcreve uma ficha existente em uma campanha `DRAFT`, com uma
protagonista por campanha. Não certifica criação legal, benefícios ou progressão.
Depois de iniciar a campanha, PATCH público só altera nome, descrição e objetivos.
Armas e treinamento de combate são aprovados localmente; o cliente não fornece dano,
Defesa, proteção, dificuldades, modificadores, dados ou efeitos de arcanos arbitrários.

## Estado e migrations

As migrations são aditivas e têm snapshots/journal Drizzle. `0002_game_engine.sql`
adiciona as 18 tabelas fundamentais. `0003_blue_rose_mechanics.sql` adiciona dez
entidades mecânicas, estende itens/focos/condições e preenche vitais de fichas anteriores.
Nenhuma tabela da Fase 2 foi duplicada ou removida. FKs restritivas preservam o chat;
FKs compostas impedem relações entre campanhas.

| Área            | Tabelas                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichas          | `characters`, `character_secrets`, `character_abilities`, `character_resources`, `character_features`, `character_details`, `character_conditions`, `character_vitals` |
| Referências     | `blue_rose_rules`                                                                                                                                                      |
| Equipamentos    | `game_items`, `character_inventory`, `blue_rose_combat_profiles`, `blue_rose_weapon_training`                                                                          |
| Narrativa       | `relationship_metrics`, `character_relationships`, `world_entities`                                                                                                    |
| Auditoria       | `game_commands`, `game_events`, `game_event_participants`                                                                                                              |
| Dados/testes    | `blue_rose_check_requests`, `blue_rose_special_check_requests`, `blue_rose_dice_rolls`, `blue_rose_advanced_tests`                                                     |
| Combate/arcanos | `blue_rose_encounters`, `blue_rose_combat_members`, `blue_rose_attacks`, `blue_rose_stunt_uses`, `blue_rose_arcana_requests`                                           |

A ficha, recursos, equipamentos, relações e mundo são relacionais. JSONB contém apenas
diffs de auditoria e recibos, não o estado canônico. Referências têm fonte, página,
estado de automação e campos de uso/requisitos/custo/efeito/duração/limitações; ausência
de regra executável não produz efeito. Condições narrativas não recebem penalidades
inventadas; Caído e fadiga suportados possuem implementação específica.

NPCs usam a mesma identidade de personagem com `NPC`, `COMPANION` ou `ADVERSARY`.
`known=false` oculta sua existência; notas/objetivos exclusivos ficam em tabela privada.
Povo, classe, antecedente, persona, idioma, objetivos, focos, graus e arcanos persistem.
Perfis de combate são transcritos, sem inferir talentos ausentes. Mundo, personagens,
progressão de teste prolongado e relações pertencem à campanha, atravessando sessões.

## Transações, repetição e auditoria

Todas as escritas bloqueiam campanha → sessão, como na Fase 2. Em campanha ativa, o
comando exige uma sessão `IN_PROGRESS` da campanha. Conclusão rejeita encontro ativo;
pausa mantém o estado. Campanha concluída rejeita novos comandos. A conclusão usa uma mensagem genérica para pré-condições de estado.

Cada comando tem `commandId` UUID. Sob o lock da campanha, o motor procura o recibo
por `(campaignId, commandId)`; repetição com mesmo hash normalizado e audiência devolve
o ID confirmado. Reuso com conteúdo diferente retorna `409`. Um pedido de teste ou
ataque também só é resolvido uma vez com chaves diferentes. O painel preserva sua
chave para repetir uma operação que falhou enquanto a página continua aberta; clientes
REST devem conservar suas próprias chaves para retries após recarregar/reiniciar.

Validação, estado, eventos/participantes, mensagem pública e recibo são escritos na
mesma transação. Falha na auditoria desfaz todas as alterações. Não há Event Sourcing
completo: o estado atual está nas tabelas e os eventos documentam alterações.
Cada evento registra campanha, sessão de origem, comando, tipo, descrição, participantes,
visibilidade, diff e timestamp. Participante desconhecido força `GM_ONLY`.

O ataque com SP abre uma resolução imediata persistida. Ações incompatíveis ficam
bloqueadas até escolher/recusar Stunts; terminar turno/encontro descarta SP e confirma
o dano pendente. Recarregar página ou pausar não muda o turno nem cria pontos extras.
Stunts gastos ficam relacionados ao ataque e à rodada para validar repetição.

## Privacidade

Não há autenticação nesta fase. `PUBLIC` e `PLAYER_ONLY` são a visão da única jogadora;
não separam múltiplas pessoas. Quem alcançar a API pode usar suas operações públicas.
CORS não fornece autenticação. Não publicar esta instalação na Internet.

As capacidades administrativas ficam em uma CLI que abre contexto Nest **sem porta
HTTP**; nenhum nome de rota ou segredo no browser concede esse poder. Pedidos secretos,
resultados, NPCs desconhecidos, condições, eventos e mundo `GM_ONLY` são filtrados no
servidor. As respostas usam schemas/projeções públicos; não há serializer que devolva
uma linha privada inteira. Sequências públicas por campanha não contam registros
secretos. Dados `GM_ONLY` não criam mensagem ou metadados no chat. Encontros com
participante desconhecido são integralmente secretos.

## API de ficha e campanha

Prefixo `/api/v1`. Entradas desconhecidas falham com `400`, entidades inacessíveis
com `404`, pré-condições/idempotência com `409`.

| Método      | Rota                                     |
| ----------- | ---------------------------------------- |
| POST / GET  | `/campaigns/:id/characters`              |
| GET / PATCH | `/characters/:id`                        |
| POST        | `/characters/:id/inventory/actions`      |
| POST / GET  | `/campaigns/:id/blue-rose/rolls`         |
| POST        | `/campaigns/:id/blue-rose/checks`        |
| GET         | `/campaigns/:id/blue-rose/requests`      |
| GET         | `/campaigns/:id/events`                  |
| GET         | `/campaigns/:id/world-state`             |
| GET         | `/campaigns/:id/relationships`           |
| GET         | `/blue-rose/rules` e `/blue-rose/stunts` |

As rotas de combate/arcanos/testes prolongados estão no documento de comandos.
Eventos e dados usam `?after=0&limit=30&sessionId=<opcional>`, limite 1–100, retorno
`{data, hasMore, nextCursor}` com sequência visível exclusiva. Não retornam contagens
secretas. Consultar histórico não muda sessão atual. Rolagens `PUBLIC` acrescentam
mensagem `SYSTEM`; `PLAYER_ONLY` aparecem somente no painel de dados.

## Operação, rollback e verificação

Ao executar no host, pare antes os containers web/API para liberar suas portas.
O PostgreSQL e seus volumes permanecem preservados.

```sh
docker compose stop web api
pnpm db:up
pnpm db:migrate
pnpm dev:game
pnpm contracts:api
pnpm test:integration
pnpm --filter @solo-rpg/api test:coverage
pnpm --filter @solo-rpg/api engine:command /tmp/comando.json
```

Atualizar: backup do PostgreSQL → migrations → API → web. Rollback operacional:
restaurar binários da Fase 2 preservando novas tabelas e dados. Não há down destrutivo;
não remover volumes. Reinstalar binários novos devolve acesso ao estado. Volume não
substitui backup; a restauração deve ser verificada antes de manutenção em dados reais.

A suíte usa PostgreSQL Docker isolado, aplica migrations duas vezes e testa regressões
anteriores, estado entre duas sessões, reinício de API e banco, idempotência, concorrência,
campos administrativos, segredo, rollback com falha de auditoria, comandos CLI reais,
combate/Stunts/cura/fadiga/testes opostos/prolongados. RNG é injetável nos testes. Schema
declarativo e entrypoints main/admin são excluídos da métrica de cobertura, mas exercitados
por migrations e pelo teste operacional CLI. Lint, tipagem, build e contratos também são
verificados. O navegador de automação não está disponível nesta instalação; não alegamos
uma inspeção visual interativa da interface.

## Evidência da entrega — 30/10/2026

- API: 75 testes aprovados (39 sem banco real e 36 de integração); cobertura de
  95,97% das linhas, 83,91% das ramificações, 94,26% das instruções e 98,71% das funções.
- Monorepo: contratos (4), web (5) e Python existente (7) também aprovados.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`, `pnpm test` e
  exportação OpenAPI aprovados. `git diff --check` sem erros.
- Migrations aplicadas/reaplicadas em PostgreSQL isolado; `pnpm db:generate`
  confirma ausência de divergência entre schema e snapshots.
- Reinício de API/PostgreSQL, duas sessões, CLI real, segredo, campos administrativos,
  idempotência e falha de auditoria exercitados. Os PDFs locais permanecem ignorados.
- Migrations não foram aplicadas ao banco de desenvolvimento do usuário nesta tarefa;
  execute `pnpm db:migrate` antes de abrir a versão nova da aplicação.

Se o executável `pnpm` não estiver no PATH desta instalação, use antes:

```sh
export PATH="$PWD/.tools/node_modules/.bin:$PATH"
```
