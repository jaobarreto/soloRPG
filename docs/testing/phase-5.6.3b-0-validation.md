# KHAOS — Fase 5.6.3B.0: estabilização e preparação de Story Cards

02/11/2026. **Validação consolidada aprovada: 485/485 testes NestJS, 33/33 suítes,
em uma única execução completa.** Auditoria e proposta de integração concluídas;
o adaptador de Story Cards não foi implementado. Zero chamadas Gemini/Groq.
Nenhuma avaliação de qualidade literária real ou implementação da próxima fase.

## A. Diagnóstico

Foram lidos integralmente os relatórios [5.6.3B](phase-5.6.3b-validation.md) e
[5.6.3A](phase-5.6.3a-validation.md), ADRs 0005/0006/0007/0010/0011, arquitetura
de memória e fronteiras de conteúdo. Foram inspecionados os arquivos e testes
G1/G2, contratos, montagem de contexto, seleção, publicação, memória e importação.
O inventário Git inicial continha alterações acumuladas de várias fases, inclusive
arquivos ainda não rastreados. Esse diff não foi atribuído a esta entrega.

A falha histórica `TEST-55-017/018/019/020` foi uma comparação de arrays provenientes
de consultas sem ordenação. O recibo bruto `/tmp/khaos563b-api-final4.log` mostra os
mesmos dois registros HEARD, com os mesmos IDs, campos e timestamps, em ordem
invertida. O arquivo anterior preservado em `/tmp/khaos563b-phase55-before.ts`
confirma a alteração de apenas duas leituras no teste: ambas ganharam
`.orderBy(n.characterKnowledge.eventId)` antes de `.toEqual(heard)`.

A comparação integral permanece; não houve `arrayContaining`, remoção de campos,
redução de quantidade, exclusão de teste ou alteração de expectativa de segurança.
Trata-se de estabilização do teste, sem mudança de produção para corrigir a ordem.
A correção já estava presente no início de B.0 e foi preservada, sem nova edição.
O [sumário B](../ai/phase-5.6.3b-validation-summary.json) continua registrando
honestamente 484/485 + reexecução dirigida; este relatório acrescenta a nova
execução consolidada, sem reescrever o resultado histórico.

A biblioteca atual permanece limitada ao caminho `snapshot.characters`. O caminho
`adventure.cast` já permite diálogo legado e memória própria, mas não recebe os
vínculos G1/G2. A auditoria abaixo identifica as diferenças que impedem tratar os
dois carregadores como equivalentes. Nenhum defeito novo de produção foi
comprovado pelos testes desta etapa; riscos de uma integração futura não foram
convertidos em implementação antecipada.

## B. Validação consolidada

| Verificação                                            | Resultado observado                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| NestJS completo (unidade + integrações + laboratórios) | **485/485**, **33/33 suítes**, 0 falhas, exit 0, **280,211 s**                     |
| Cobertura global NestJS                                | statements **92,55%**, branches **84,55%**, functions **96,63%**, lines **94,00%** |
| Cobertura biblioteca / rendering                       | biblioteca: lines 100%, branches 95,34%; rendering: lines 98,88%, branches 94,54%  |
| Python completo                                        | **359/359**, exit 0, **10,35 s**, cobertura global **86%**                         |
| Contratos compartilhados                               | **14/14**, exit 0, **261,91 ms**                                                   |
| Builds API/contratos/Python                            | Aprovados                                                                          |
| Typecheck API/contratos/Python                         | Aprovados                                                                          |
| Lint API/contratos/Python                              | Aprovados                                                                          |
| Fixture futura                                         | Definição/schema, digest e IDs validados; nenhum adaptador exercitado              |

O comando NestJS foi executado **uma vez nesta fase**, com exit code 0:

```sh
PATH="$PWD/.tools/node_modules/.bin:$PATH" node scripts/test-integration.mjs --coverage
```

Não se somaram execuções parciais para declarar 485/485. Não houve falha de teste,
retry ou desativação de cenário nessa rodada. As mensagens `request.failed` do
logger aparecem em testes que provocam falhas e rollback deliberadamente; não
foram falhas do Jest. As regressões da 5.6.2 estão incluídas: publicação integral,
paráfrase recusada, speaker/factIds, catálogo recomposto, fallback, galeria secreta
inventada, resultados oficiais e memória da mensagem efetivamente publicada.
Também passaram as regressões PROPOSE, ARCANA, QUERY, OBSERVE, PREPARED_CHECK,
CLARIFY, menções, progressão, canonicidade e os laboratórios A/B.

Ambiente observado: Node 24.17.0, Python 3.12.16, PostgreSQL 17 na imagem
`pgvector/pgvector:0.8.2-pg17-bookworm` fixada pelo digest já existente no Compose.
O runner usa nome/volume únicos `solorpg-test-*`, senha efêmera, porta aleatória
em `127.0.0.1` e banco `solorpg_test`; aplica as migrations **existentes** apenas
nesse banco e remove container/volume ao terminar. Nenhuma migration foi criada.
`test/setup.ts` substitui `DATABASE_URL` pela URL descartável; não usa credenciais
locais. Campanhas e importações criadas por testes são sintéticas e descartáveis.

O sandbox restrito já havia causado `listen EPERM`/falhas de subprocesso na etapa
B. Nesta etapa, os testes que precisam de portas/subprocessos locais foram
executados com essa permissão desde o início. Não houve rejeição de aprovação nem
falha de sandbox nesta rodada. Isso não concedeu uso de Gemini/Groq ou de banco
real. Os provedores dos testes permanecem simulados; o grafo Python e HTTP local
não constituem uma chamada real ao modelo.

Demais comandos executados, com exit code 0, a partir da raiz com o mesmo PATH:

```sh
pnpm --filter @solo-rpg/shared-contracts build
pnpm --filter @solo-rpg/shared-contracts test
node scripts/uv.mjs run pytest --cov=app --cov-report=term-missing
pnpm --filter @solo-rpg/api build
pnpm --filter @solo-rpg/ai-service build
pnpm --filter @solo-rpg/api typecheck
pnpm --filter @solo-rpg/shared-contracts typecheck
pnpm --filter @solo-rpg/ai-service typecheck
pnpm --filter @solo-rpg/api lint
pnpm --filter @solo-rpg/shared-contracts lint
pnpm --filter @solo-rpg/ai-service lint
```

O lint Python inclui Ruff e checagem de formatação; typecheck usa Mypy. Os builds
afetados são API, contratos e compilação Python. O frontend não foi alterado nem
foi necessário reconstruí-lo para esta auditoria. Os recibos brutos e comandos
estão preservados em [test-receipts](../ai/phase-5.6.3b-0-test-receipts.json);
o [sumário](../ai/phase-5.6.3b-0-validation-summary.json) registra cobertura,
exit codes, hashes e fronteiras real/simulada.

## C. Arquitetura atual dos Story Cards

### Referência, versões e importação

- [definition.ts](../../apps/api/src/adventures/definition.ts) define o schema
  estrito `AdventureDefinition`: ID, versão, personagens, locais, encontros,
  cenas, sessões, finais e progressão opcional. Cada card possui `key`,
  `identityKind` (`INDIVIDUAL`/`ARCHETYPE`), nome, descrição, papel, personalidade,
  speech, história, motivações, objetivos, medos, segredos, conhecimento estático,
  relações textuais, local, sheet opcional textual e páginas de referência.
- Os conteúdos de Gloamhale estão em `gloamhale.ts`, `gloamhale-v2.ts` e
  `gloamhale-v3.ts`; a composição registra essas versões em
  [adventure-registry.module.ts](../../apps/api/src/adventures/adventure-registry.module.ts).
  `AdventureRegistry.get(id, version)` exige registro explícito. O default de
  campanhas novas é v3; o alias IMPORT legado sem seletor mantém v1.
- [import.ts](../../apps/api/src/adventures/import.ts) valida o conteúdo, calcula
  `digest(definition)` e armazena a referência em `adventure_definitions`, chave
  `id:vN`. Se a mesma chave apresentar outro digest, recusa sobrescrever e exige
  versão revisada. Importação repetida da mesma campanha/versão é idempotente;
  outra versão ou campanha já iniciada não substitui o histórico.
- [adventure-schema.ts](../../apps/api/src/database/adventure-schema.ts) separa
  `adventure_instances` (campanha, definitionId, entityNamespace, protagonista,
  revisão e mecânicas locais) de `adventure_cast` (campanha, key, known,
  currentState). Importar a referência cria as linhas de cast, **não uma ficha
  em `characters` para cada card**. `currentState` inicia como texto
  “Sem alterações confirmadas.”; o card de referência continua imutável.

### Identidade persistente

[identity.ts](../../apps/api/src/adventures/identity.ts) deriva a identidade por
SHA-256 da string `namespace:campaignId:key`, formatando um UUID compatível com o
algoritmo existente. O namespace deve vir de `loaded.instance.entityNamespace`;
o default legado da função é `gloamhale` e não serve como default de um adaptador
genérico. Nome, personalidade e sessão não entram no cálculo.

A chave persistida do cast é `(campaignId, key)`; o UUID é derivado nas projeções,
não uma FK para `characters`. O algoritmo não incorpora versão ou tipo de
entidade: o vínculo futuro precisa verificar também definitionId/digest e tipo
de origem. Não mudar a fórmula para resolver colisões ou criar identidades novas
em campanhas existentes. Personagens regulares recebem UUID persistido pelo
banco; comandos idempotentes de transcrição da party não os convertem em cast.

### Cena, presença e disponibilidade

[execution.ts](../../apps/api/src/adventures/execution.ts) prepara a cena em
`adventure_scenes` e recria o JSONB `sessionPlans.plan`. `presentCharacterIds`
contém protagonista e companheiros regulares, com validação de campanha, vida e
presença. Os Story Cards vêm de `scene.characterKeys`, não desse array.
`activateAdventureScene` marca essas identidades como conhecidas e torna o local
público/acessível quando a sessão está em andamento.

[adventureContext](../../apps/api/src/adventures/state.ts#L285) recupera somente
cast conhecido pertencente à cena atual. `NarrativeContextService.build` limita
os atores conversáveis a `INDIVIDUAL`, projeta `kind: STORY_NPC` e usa
`available: true` para esse conjunto. Não consulta `characterVitals` para cast e
não interpreta a string `currentState` como um estado de Saúde. O módulo pode
atualizar essa string por eventos oficiais, mas isso não constitui um gate
universal de disponibilidade. Uma futura réplica precisa de condições explícitas
sobre estado/presença; estar conhecido não basta.

[mentions.ts](../../apps/api/src/narrative/mentions.ts) também distingue identidade
conhecida de presença: cards individuais conhecidos podem aparecer como KNOWN
fora da cena. Menção identifica um alvo; não o torna presente, não transmite
memória e não autoriza uma resposta contextual. Homônimos devem ser resolvidos
pelo ID revalidado da menção, não por aproximação de nome.

### Memória, relações e projeções

`adventure_memories` associa `(campaignId, characterKey, eventId)` ao cast e a um
evento da mesma campanha, com PK e FKs. Não tem `source`, `importance` ou papel de
participante. `rememberAdventureEvent` associa eventos aos indivíduos conhecidos
da cena atual. A adjudicação local também registra testemunhas explicitamente
validadas pela cena; a mesma tabela é utilizada pelos dois caminhos.

`adventureContext` busca memórias apenas dos indivíduos relevantes, por sequência,
sem corte global, admitindo eventos PUBLIC/PLAYER_ONLY. A descrição estática
`card.knowledge` não é uma associação de memória adquirida. O renderer seleciona
somente o conhecimento do interlocutor e projeta as associações de cast como
**HEARD**, conservadoramente. Essa projeção não recupera a modalidade histórica
que a tabela não guardou. O adaptador não poderá inventar `WITNESSED`.

As relações numéricas estão em `character_relationships`, com FKs para
`characters`. O renderer filtra relações originadas no interlocutor regular.
`card.relationships` são strings da referência, não métricas públicas nem prova
de alteração de amizade/confiança. Não existe hoje um carregamento equivalente
de relações numéricas para o UUID derivado de cast.

No caminho de cast, `rendering.speaker` recebe nome, personalidade, speech e
currentState; motivations é vazio. História, objetivos, medos, segredos,
conhecimento estático e relações textuais não são promovidos a fatos públicos.
O catálogo legado usa a personalidade para sua abertura, mas não transforma
speech em uma nova frase autorizada. Na biblioteca G1/G2, a voz é escolhida pelo
vínculo explícito, não por essa classificação ampla de personalidade.

O snapshot interno de aventura contém identidade completa e `adventure.gm`
(incluindo Director, encontro e mecânicas). Isso exige distinguir armazenamento,
contexto interno e projeção externa: `planner_request` reduz a proposta FREE ao
menu seletivo; `rendering` usa campos permitidos, memória própria e catálogo.
O futuro adaptador não pode simplesmente serializar o card/snapshot inteiro.

`NarrativeResolutionService.rememberReply` registra somente as falas DIALOGUE
validadas, como `NPC_REPLY_RECORDED`; `remember` grava HEARD para os regulares e
associa o evento ao cast presente. A lista relacional de participantes do evento
usa os personagens regulares disponíveis. `eventParticipants.characterId` tem
FK para `characters`; não aceita automaticamente o UUID derivado de um card.
Mensagem final, fala e memória são atômicas, idempotentes, e não produzem efeitos
mecânicos extraídos da prosa.

## D. Diferenças relevantes para G1/G2

| Aspecto         | Personagem regular                                       | Story Card instanciado                                                    |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Identidade      | UUID persistido em characters                            | key por campanha + UUID derivado com namespace                            |
| Referência      | Perfil/estado em characters; detalhes privados separados | AdventureDefinition imutável + estado em adventure_cast                   |
| Presença        | presentCharacterIds; vida/living/ALIVE                   | characterKeys da cena atual + known                                       |
| Disponibilidade | characterVitals e presença                               | Cast elegível projetado available=true; sem gate de vitais equivalente    |
| Memória         | character_knowledge: source, importance, evento          | adventure_memories: key/evento; modalidade não armazenada                 |
| Participação    | eventParticipants com FK para characters                 | Associação ao cast não prova participação pessoal; UUID não pertence à FK |
| Relações        | Métricas persistidas entre IDs regulares                 | Strings da referência; não carregadas como métricas do cast               |
| Ficha           | Dados estruturados de habilidades, recursos e Saúde      | sheet textual/null não instancia uma ficha mecânica                       |
| Voz do renderer | personality; speech vazio neste recorte                  | personality e speech da referência                                        |
| G1/G2 atual     | Menu e réplicas por vínculo da sessão                    | Carregador G1/G2 não é invocado para cast                                 |

A party fornecida por uma aventura é transcrita por comando local em personagens
regulares. Não confundir esse fluxo com a importação de Story Cards. Isso explica
por que companheiros podem usar o primeiro caminho mesmo em Gloamhale.

## E. Proposta concreta de integração — não implementada

### Vínculo explícito e sem alteração da aventura

Propor um campo opcional separado `scenePlan.storyCardDialogue`, no JSONB já
existente. Manter `scenePlan.dialogue` e a biblioteca v1 dos regulares compatíveis.
Os nomes/shape precisam ser aprovados e formalizados na próxima entrega; o
`draftBinding` da fixture é uma **proposta interna**, recusada pelos contratos
atuais se enviada como vínculo regular.

O vínculo proposto identifica:

- `bindingVersion`, biblioteca/contentVersion e fragmentos da biblioteca;
- `owner.kind=STORY_CARD`, definitionId, definitionDigest, entityNamespace,
  characterKey e entityId esperado; campanha/sessão vêm do envelope persistido;
- voiceId revisado, assuntos/atos disponíveis, estado esperado e escopo da cena;
- referências e hashes integrais de fontes, autoria/proveniência e revisão local.

Um manifesto de preparação separado da definição pode mapear uma versão/digest
exatos e keys de cards para conteúdos revisados. Ele só será usado com habilitação
explícita na preparação local da campanha/cena. Nenhum nome, perfil semelhante,
versão mais nova ou simples existência de um card habilita conteúdo. O registro
de módulos continua explícito; não haverá plugin dinâmico, novo serviço ou
reescrita de definições/digests antigos.

### Carregamento, fontes e fronteira de publicação

Propor uma projeção interna de interlocutor discriminada entre REGULAR e
STORY_CARD. Cada origem mantém seu carregador de identidade/memória; ambas
entregam somente identidade pública, estado, disponibilidade e fontes verificadas
à autorização de conteúdo. Essa projeção não cria uma segunda entidade nem
concede comandos mecânicos.

O caminho Story Card deverá verificar, nas duas montagens (geração e transação):

1. Campanha/sessão e instância corretas; versão registrada e digest armazenado
   iguais ao vínculo; namespace explícito e UUID rederivado exatamente.
2. Key pertencente à referência, `INDIVIDUAL`, conhecida e na cena atual. Menção
   KNOWN não satisfaz presença. Estado deve corresponder à preparação; condição
   de disponibilidade ou mecânica específica deve vir de política oficial do
   servidor, sem classificar prosa com regex. Falta de prova recusa a réplica.
3. Um único vínculo revisado para essa identidade/escopo; ambiguidade, colisão de
   origem ou versão desconhecida falham fechadas, sem procurar pelo nome.
4. Memória ligada àquela key e campanha; evento confirmado, digest e tipo atuais.
   Para o novo catálogo, começar com PUBLIC, como o G1/G2 regular. Não ampliar
   para PLAYER_ONLY apenas porque o contexto legado o recupera. Fontes de mundo
   também precisam ser públicas e acessíveis na cena autorizada.
5. Cada requisito do fragmento deve ter prova própria. O recorte inicial pode
   oferecer conversa geral e promessa baseada em SPEECH_RECORDED público
   realmente associado ao NPC, sempre como HEARD. A biblioteca v1 exige esse
   tipo específico para promessa; não reclassificar NPC_REPLY_RECORDED para
   encaixá-lo nela. Novas formas de conteúdo exigem revisão/versionamento.
6. Memórias legadas sem modalidade/papel permanecem não comprovadas para
   WITNESSED e participação. O atual fragmento de desacordo em primeira pessoa
   não deve ser liberado para cast copiando o UUID para eventParticipants ou
   inventando source. Registrar essa capacidade como indisponível até existir
   prova estruturada e persistida, com autoria explícita, em escopo posterior.

A associação legada a um evento não basta para provar esse último requisito:
`rememberAdventureEvent` também memoriza falas ouvidas, e a adjudicação registra
associações na mesma tabela. Tipo CONSEQUENCE_RECORDED e currentState não
substituem prova de percepção ou participação. Uma evolução futura pode guardar
proveniência aditiva nos metadados dos eventos novos, mas precisa de contrato e
testes próprios; não preencher retroativamente conhecimento antigo por inferência.

PROPOSE continua selecionando `topic/act` do menu filtrado. O servidor resolve o
alvo por identidade/menção e escopo; não envia vínculo privado, segredos, critérios
do Director ou fonte alheia. NARRATE recebe apenas beats completos autorizados.
Manter speakerId/factIds exatos, texto integral, uma alternativa contextual por
fala e o catálogo recomposto pelo servidor na transação. Sem resposta segura,
CLARIFY ou fallback atual; rejeição continua registrada e não vira acerto semântico.

A réplica efetivamente publicada continua sendo fala atribuída; sua memória só
atinge indivíduos presentes/autorizados. Usar as associações próprias do cast,
sem inserir seu ID nas FKs dos regulares. Nenhuma frase altera Saúde, inventário,
relações, consentimento ou objetivos. Repetição recupera o mesmo recibo/mensagem.

### Preparação, compatibilidade e implantação futura

`prepareAdventureScene` recria/substitui todo o plan. Um vínculo adicionado
manualmente pode desaparecer na próxima preparação. A integração deverá definir
um carregamento explícito por escopo: reaplicar apenas o manifesto autorizado
para a cena/instância exatas; caso contrário, revogar, sem transportar permissões
para a cena seguinte. Não preservar blobs indiscriminadamente.

Não há necessidade demonstrada de nova tabela/migration para esse primeiro
vínculo. Contratos internos aditivos e autorização server-side devem preceder o
uso dos menus novos. Seletores FREE e schema de beats podem permanecer iguais;
qualquer mudança no wire exigirá espelhos Pydantic/Zod e testes reais de
serialização. Desabilitar o vínculo deve restaurar o caminho legado seguro,
conservando chats, eventos, IDs e memórias. Não reverter a proteção da 5.6.2.

## F. Matriz preparada para o futuro adaptador

Todos os pontos `TEST-SCARD-001–020` abaixo estão **unverified para o adaptador**:
são especificações, não testes aprovados. Os controles existentes exercitam partes
da segurança/base de Story Cards, mas não certificam o carregador G1/G2 futuro.
Não foram criados testes pendentes, skips novos ou casos obrigatoriamente falhos.

A [fixture](../../apps/api/test/fixtures/story-card-dialogue-plan.json) contém uma
definição sintética validada pelo schema atual, dois indivíduos com nomes que se
normalizam igualmente (`Lior`/`Líor`), um arquétipo, duas cenas/sessões, IDs
persistentes derivados com namespace próprio, estados e fontes exclusivas,
marcadores privados e um vínculo proposto opt-in. Só o bloco `definition` é um
AdventureDefinition atual. Instâncias/eventos/draftBinding são dados de
planejamento, não um contrato de importação ou comandos executáveis. O validador
não registrou a aventura nem abriu banco. As páginas são referências lógicas da
fixture, não citações de regra oficial.

Validação reproduzível do bloco de referência, depois do build API:

```sh
node <<'JS'
const assert = require('node:assert/strict');
const f = require('./apps/api/test/fixtures/story-card-dialogue-plan.json');
const { adventureDefinitionSchema } = require('./apps/api/dist/adventures/definition');
const { digest, adventureEntityId } = require('./apps/api/dist/adventures/identity');
const definition = adventureDefinitionSchema.parse(f.definition);
assert.equal(digest(definition), f.campaign.definitionDigest);
for (const c of f.cast) {
  assert.equal(c.entityId, adventureEntityId(
    f.campaign.campaignId, c.characterKey, f.campaign.entityNamespace,
  ));
}
JS
```

Esse comando não valida o futuro draftBinding nem exerce uma autorização nova.

| TEST-ID        | Preparação/variação                                     | Resultado futuro observável                                                           | Nível e propósito                      |
| -------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------- |
| TEST-SCARD-001 | keeper-a conhecido na study; vínculo correto            | Menu/beat da voz explícita, fonte própria e proveniência                              | integration; critical path             |
| TEST-SCARD-002 | Mesma key ausente da cena                               | Sem réplica/menu e sem memória de fala alheia                                         | integration; rule protection           |
| TEST-SCARD-003 | Conhecido mas estado/disponibilidade incompatível       | Recusa sem inferir disponibilidade de personalidade ou texto livre                    | integration; rule protection           |
| TEST-SCARD-004 | Lior/Líor; menção aponta uma identidade                 | ID exato ou CLARIFY na ambiguidade; sem troca de interlocutor                         | integration; regression protection     |
| TEST-SCARD-005 | Reabrir sessão; mudar campanha/namespace/digest         | ID estável na mesma instância; vínculos estrangeiros/incompatíveis recusados          | contract, integration; rule protection |
| TEST-SCARD-006 | SPEECH_RECORDED público associado só a keeper-a         | Resposta atribuída com eventId correto; não prova cumprimento                         | integration; critical path             |
| TEST-SCARD-007 | Fonte OTHER_NPC_ONLY associada só a keeper-b            | Não aparece no catálogo/resposta de keeper-a                                          | integration; rule protection           |
| TEST-SCARD-008 | Segredos/card.knowledge/GM_ONLY/Director/cena futura    | Marcadores ausentes de menu, NARRATE público, chat, SSE e memória da réplica          | integration; rule protection           |
| TEST-SCARD-009 | Remover fonte, alterar digest, acesso ou condição       | Fragmento indisponível; sem completar lacuna com texto novo                           | unit, integration; rule protection     |
| TEST-SCARD-010 | Estado/presença/fonte muda depois da geração            | Revalidação transacional revoga beat; fallback seguro sem memória rejeitada           | integration; regression protection     |
| TEST-SCARD-011 | Trocar speakerId/factIds, texto ou somar alternativas   | Rejeição integral; somente fala final atribuída/persistida                            | contract, integration; rule protection |
| TEST-SCARD-012 | Duas sessões e replay da mesma actionId                 | Histórico intacto; memória própria persiste; sem nova fala/evento/chamada no replay   | integration; regression protection     |
| TEST-SCARD-013 | Aventura antiga sem vínculo/manifesto                   | Mesmo caminho legado; nada habilitado por nome ou perfil                              | integration; regression protection     |
| TEST-SCARD-014 | contentVersion/bindingVersion/definição desconhecida    | Falha fechada; sem downgrade ou alteração de digest                                   | contract, integration; rule protection |
| TEST-SCARD-015 | Rascunho da galeria após fracasso oficial               | Chat só com resultado literal autorizado; galeria não lembrada                        | integration; regression protection     |
| TEST-SCARD-016 | Fala promete ajuda/perdão ou alega resultado            | Mundo, Saúde, inventário, relações e objetivos iguais; apenas fala/memória autorizada | integration; rule protection           |
| TEST-SCARD-017 | Memória legada de consequência sem papel/modalidade     | Não promover para WITNESSED/participação; desacordo pessoal indisponível              | unit, integration; rule protection     |
| TEST-SCARD-018 | Vínculo aponta ARCHETYPE ou key inexistente             | Recusa; sem memória coletiva ou criação arbitrária de NPC                             | unit, integration; rule protection     |
| TEST-SCARD-019 | ID semelhante em REGULAR/STORY_CARD e FKs incompatíveis | Origem explícita; sem personagem sombra, cópia de memória ou relação inventada        | integration; rule protection           |
| TEST-SCARD-020 | Repreparar study e depois courtyard                     | Vínculo revalidado por escopo ou revogado; permissão não vaza para cena futura        | integration; regression protection     |

Execução futura sugerida: testes de autorização puros + contratos serializados +
uma integração HTTP/grafo/Python/PG descartável com provedores roteirizados,
seguindo `phase563b-lab.spec.ts`. Acrescentar os testes quando o adaptador for
implementado, mantendo os TEST-IDs; só então mudar o estado de cada ponto para
covered. Não há avaliação de Gemini nesses casos offline.

Evidência atual correlata: `dialogue-content.spec.ts`,
`phase562-publication.spec.ts`, `integration/phase561-canonicity.spec.ts`,
`integration/gloamhale.spec.ts` (sigilo, memória individual, versões/adjudicação)
e `integration/phase55.spec.ts` (menções, presença e progressão). A suíte completa
B.0 os executou; a cobertura desses componentes não elimina as lacunas do adaptador.

## G. Compatibilidade com as Fases 5.7 e 5.8

As decisões futuras de criação de protagonista, party, NPCs/monstros mecânicos,
Story Cards e autonomia limitada devem manter identidade narrativa e ficha
mecânica distinguíveis. A existência de um card ou de `sheet: string` não cria
uma ficha. Uma futura associação à ficha precisa de referência explícita e
versionada; não usar nome parecido, criar characters duplicados ou migrar
memória implicitamente para satisfazer uma FK.

A identidade persistente atual deve sobreviver à evolução; resolver a relação
entre sujeito narrativo e ator mecânico antes de abrir CRUD/autonomia. Definir
quem pode criar/vincular NPCs em aventura publicada e como esse ato fica auditado:
o comando administrativo interno CHARACTER_CREATE existente não é autorização
para a IA gerar elenco arbitrário. Nenhum novo endpoint foi criado aqui.

Autonomia de companheiro é outra capacidade: uma fala ou biblioteca de voz não
autoriza comandar ações, consumir recursos, rolar dados ou completar objetivos.
O futuro executor deve continuar passando pelos validadores mecânicos e consentimento
aplicáveis. Não se ampliou Blue Rose nem se executaram pendências 5.7. O adaptador
proposto depende de IDs, origem, estado, presença e fontes, sem nomes fixos de
protagonistas/NPCs e sem dependência exclusiva de Gloamhale.

## H. Riscos e limites

- **Sigilo:** o card completo/snapshot interno possui campos privados. Exigir
  projeção mínima antes do modelo e sentinelas negativas; não confiar apenas em
  rótulos de beat ou factIds válidos. TEST-SCARD-008/011/015.
- **Modalidade/papel:** adventure_memories não preserva source nem participação;
  tipo de evento não supre essa lacuna. Falha fechada pode reduzir repertório,
  mas evita transformar relato em vivência pessoal. TEST-SCARD-006/017.
- **Versão/identidade:** a fórmula de UUID não inclui versão/tipo, e o default
  é legado. Vínculo precisa de namespace/origem/digest explícitos; não recalcular
  IDs históricos com outra fórmula. TEST-SCARD-005/014/019.
- **Disponibilidade:** known, presença e currentState são conceitos diferentes;
  cast não tem vitais equivalentes. Precisará de condições declaradas e
  revalidação, sem parser psicológico de palavras. TEST-SCARD-002/003/010.
- **Duplicação e relações:** FKs de memória regular, participantes e relações não
  aceitam cast automaticamente. Não criar fichas sombra ou promover relações
  textuais a métricas; planejamento 5.7/5.8 ainda pendente. TEST-SCARD-019.
- **Repreparação:** upsert substitui o plan. Definir reautorização/revogação por
  escopo antes de persistir novos vínculos. TEST-SCARD-020.
- **Autoria:** digest garante identidade, não pertinência/verdade da associação
  assunto/fonte. Conteúdo/voz requerem revisão; versão nova não implica aprovação
  humana nem qualidade Gemini. A prosa formulaica observada em B permanece.
- **Escopo da prova:** suíte verde protege invariantes executados, não toda
  semântica possível nem comportamento real de modelo. O adaptador permanece
  não implementado, e seus 20 pontos não são contados entre os 485 testes.

## I. Preservação e mudanças desta etapa

A fotografia inicial SHA-256 verificou **415 arquivos preexistentes** (inclusive
os não rastreados): **414 permanecem byte a byte iguais**. O único arquivo
preexistente modificado é `docs/testing/narrative-tests.md`, que recebeu o índice
desta validação e dos testes futuros. Foram excluídos da fotografia apenas Git,
dependências/ferramentas, builds, caches e cobertura gerada.

Arquivos novos desta entrega:

- Este relatório A–J.
- `apps/api/test/fixtures/story-card-dialogue-plan.json`: preparação sintética.
- `docs/ai/phase-5.6.3b-0-test-receipts.json`: saídas brutas dos testes/checks.
- `docs/ai/phase-5.6.3b-0-validation-summary.json`: resultados e preservação.

**Nenhum arquivo de produção, contrato, teste executável ou definição de aventura
foi alterado nesta fase.** O teste de ordenação conserva exatamente a correção
recebida de B. O inventário inclui os quatro PDFs locais, `.env`, `.env.example`,
modelos/provedores, regras, migrations e evidências históricas. Não se reverteu
nenhuma alteração anterior do repositório.

A nova fixture só foi analisada em memória com os helpers de produção, sem
registro no AdventureRegistry, comando IMPORT ou campanha real. Os testes
existentes realizam importações de campanhas sintéticas no PostgreSQL descartável;
nenhuma definição/digest em uso ou instância real foi reimportada. Não foi feita
leitura/auditoria de um banco real; a evidência é o isolamento do runner e a
inexistência de comandos dirigidos a esse banco.

Nenhuma configuração financeira, modelo/provedor, fallback, `.env`, PDF, regra
Blue Rose, Director, progressão, migration, dependência ou serviço foi alterado.
A publicação 5.6.2 e sua comparação integral permanecem idênticas. Recibos,
relatórios, gabaritos e conteúdos históricos A/B continuam intactos; `/tmp`
recebe apenas a nova execução dos laboratórios, sem sobrescrever os artefatos
históricos versionados em docs/ai.

## J. Próxima entrega recomendada

Solicitar revisão do operador para uma entrega limitada: **adaptador opt-in G1/G2
para Story Cards INDIVIDUAL**, começando pela fixture sintética e por vínculos
explícitos da instância/cena, sem ligar automaticamente bibliotecas a Gloamhale.
Implementar projeção de interlocutor com origem, validação de definição/namespace,
menu filtrado, fontes próprias PUBLIC, autorização transacional e proveniência.
No primeiro recorte, conversa geral e fontes de fala HEARD; manter indisponíveis
requisitos de WITNESSED/participação sem prova persistida.

Aceite dessa entrega futura: os pontos aplicáveis da matriz executáveis e
aprovados, caminhos antigos preservados, galeria/segredos bloqueados, persistência
atômica/idempotente e nenhuma consequência mecânica derivada da fala. Deixar
explícitas as capacidades ainda bloqueadas por proveniência incompleta. Uma
revisão separada poderá definir a prova estruturada para fontes novas, sem
reclassificar memórias antigas.

Fora desse próximo recorte: CRUD, party autônoma, fichas novas, mudanças de
aventuras/PDFs, G3/G4/G5/G6, juiz LLM, paráfrase livre e avaliação real sem nova
autorização específica. Esta B.0 termina com relatório, recibos e proposta;
nenhuma implementação da próxima fase foi iniciada.
