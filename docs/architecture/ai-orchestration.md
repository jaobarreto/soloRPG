# Mestre de IA e oficialização

A implementação da Fase 4 segue a [ADR 0005](../adr/0005-oficializacao-de-acoes-da-ia.md):
**propor → validar e resolver no Game Engine → commit → narrar → persistir → entregar**.
Prosa, JSON bem formado e confiança do modelo não demonstram que um efeito ocorreu.

## Componentes e contratos

`NarrativeService` recebe a ação e salva mensagem + identidade em PostgreSQL antes
de chamar FastAPI. `NarrativeContextService` monta uma visão seletiva. Python usa
LangGraph com os nós `interpret_and_propose` e `narrate_confirmed`, selecionados
pelo estágio informado pelo servidor. O grafo não possui ferramentas de escrita,
credenciais do banco, checkpoint em memória ou permissão administrativa.

`packages/shared-contracts/src/narrative.ts` define os contratos TypeScript/Zod;
`app/narrative/schemas.py` define o espelho Pydantic estrito. A proposta aceita
somente `OBSERVE`, `SCENE(optionId)` e `ATTACK(actorId,targetId)`. Não aceita Vida,
dano, faces de dados, comandos genéricos ou texto narrativo antecipando o resultado.
A resposta de narração contém somente `narrative` e `eventIds`.

O adaptador TypeScript constrói comandos específicos e chama o motor dentro da
mesma transação que confirma o recibo narrativo. Nunca encaminha a saída bruta do
modelo a `executeInternal`. Mesmo o caminho servidor recusa comandos como
`RESOURCE_SET`, `ITEM_GRANT`, `CHARACTER_CREATE` e `SCENE_CONFIGURE`.

## Estado persistente

```text
PENDING → AWAITING_ROLL → COMMITTED → COMPLETED
       ↘ AWAITING_STUNTS ↗
       ↘ COMMITTED
       ↘ REJECTED (cancelamento explícito antes de efeitos)
```

`COMMITTED` significa que os efeitos e a projeção autorizada já existem no banco;
`COMPLETED` significa que uma mensagem definitiva do Mestre também foi persistida.
Preparar um teste confirma somente o pedido. Um ataque com Stunts pendentes não
confirma o dano. Os estados pendentes sobrevivem a reinícios do Python e da API.

O UUID `actionId` é a chave de idempotência global. Repetição com conteúdo diferente
retorna 409. Cada etapa do motor deriva um UUID estável da ação; recibos existentes
não são executados novamente. Uma restrição parcial admite só um turno pendente por
campanha. Os caminhos antigos de mensagens e comandos também respeitam esse bloqueio.

Locks seguem campanha → sessão. Uma lease persistida de 90 s impede chamadas
concorrentes ao provedor; um token impede que o worker antigo grave após expirar.
O contexto é revisado por eventos, sequência de mensagens e registros de campanha/
sessão. Pausar ou alterar estado durante uma chamada impede aplicar sua resposta.
Chamadas de IA ocorrem sempre fora da transação. Nenhum worker, Redis ou broker é
necessário: a UI consulta e retoma o registro existente.

## Políticas executáveis e limites

Uma opção de cena é preparada localmente com o comando `SCENE_CONFIGURE`, antes
do início da sessão. Contém modo, termos da intenção, pré-requisitos, teste oficial
opcional e consequências autorizadas. O modelo escolhe uma opção; o servidor
exige a seleção explícita da opção pela jogadora (`optionId`) e confere todas
as precondições. A IA não transforma uma palavra isolada em autorização. Cada opção bem-sucedida só ocorre uma vez.

Os efeitos disponíveis são transferência de item existente, delta limitado de uma
relação já configurada e transição de estado de entidade existente. O motor confere
posse, quantidade, capacidade, métrica/limites, campanha e status esperado. Não se
escrevem sentimentos da protagonista. Todos os efeitos dependentes e o evento
resultante confirmam juntos; uma falha reverte o conjunto.

Ataques só são permitidos para NPC presente, vivo, em encontro público preparado.
Turno, arma, alcance, acerto, proteção e dano continuam no motor da Fase 3.
Stunts de NPC aguardam adjudicação explícita; há uma operação para dispensá-los.
Seleção autônoma de Stunts pelo Mestre não está implementada.

**Narração conservadora:** não existe uma prova determinística de correção semântica
de prosa arbitrária. Por isso o validador só publica texto idêntico à projeção
confirmada; diferenças usam seu texto determinístico. Em cenas, a prosa vem da
preparação autorizada; em combate, dos resultados oficiais. Não se declara aqui um
Mestre com diálogo livre validado, improvisação irrestrita ou compreensão completa
de negação/intenção. Correspondência de palavras é uma precondição adicional, não uma
solução semântica geral; a seleção explícita preserva a autorização da jogadora. Fora das capacidades preparadas, nenhum efeito é inventado.

## API pública

Prefixo `/api/v1/campaigns/:campaignId/sessions/:sessionId`:

| Método e sufixo                             | Responsabilidade                                                    |
| ------------------------------------------- | ------------------------------------------------------------------- |
| POST `actions`                              | `{actionId, optionId?, interactionMode, content}`; mensagem + turno |
| GET `actions/:actionId`                     | Projeção pública do estágio; sem proposta ou segredos               |
| POST `actions/:actionId/retry`              | Retoma somente a etapa faltante                                     |
| POST `actions/:actionId/roll`               | Resolve o teste público vinculado, sem dados do cliente             |
| POST `actions/:actionId/decline-npc-stunts` | Adjudicação explícita sem Stunts                                    |
| POST `actions/:actionId/cancel`             | Cancela somente tentativa PENDING, preservando mensagem             |
| GET `actions/:actionId/stream`              | SSE com snapshot persistido; reconexão nunca executa ações          |
| GET `narrative-state`                       | Último turno, objetivos e progressão ponderada                      |
| GET `summary`                               | Resumo complementar ao chat                                         |
| POST `finalize`                             | Encerramento com resumo factual e desbloqueio da próxima sessão     |
| GET `ai-usage`                              | Contadores técnicos por provedor/modelo, sem conteúdo               |

POSTs de retomada aceitam corpo `{}`. O streaming é de estado persistido, não de
tokens; a UI usa consulta periódica. Endpoints estão descritos no Swagger.
FastAPI expõe `POST /internal/turn`, autenticado por `X-AI-Token`; ausência de segredo
recusa acesso. Não publicar sua porta na rede doméstica.

## Atualização e recuperação

A migration 0004 é aditiva. Aplicar migrations → API/Python → web. Os contratos e
endpoints anteriores continuam disponíveis; o chat novo utiliza `actions`.
O encerramento legado mantém seu comportamento para sessões sem plano; sessões
preparadas exigem o novo `finalize`, que valida evidências e produz resumo.
Reverter binários não exige remover tabelas; preservar migration, histórico e volume.
Não executar comandos antigos durante um turno narrativo pendente. Antes de qualquer
rollback em dados reais, realizar backup local verificável. Não há down destrutivo.
