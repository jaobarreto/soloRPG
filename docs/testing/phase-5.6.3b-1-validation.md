# KHAOS — Fase 5.6.3B.1: adaptador opt-in de Story Cards

02/11/2026. Implementação offline G1/G2 para Story Cards individuais, sem criação
ou conversão de personagens. Zero chamadas Gemini/Groq. A interpretação real, a
qualidade literária e a variação neural entre turnos não foram avaliadas.

**Suíte NestJS consolidada aprovada: 509/509 testes, 35/35 suítes.** Os testes,
builds, typecheck, lint e exportação passaram. A verificação global de formatação
permanece **reprovada por 19 arquivos históricos inalterados**; portanto não se
declara que todos os comandos do workspace estão verdes nem aprovação global
irrestrita. Os arquivos deste recorte estão formatados. Entrega para revisão do
operador, com essa pendência explícita.

## A. Diagnóstico inicial e responsabilidades

Foram consultados os relatórios A/B/B.0, renderer, autonomous-master, menções,
ADRs 0010/0011, arquitetura de aventuras/memória e a fixture sintética B.0. As
leituras anteriores A/B foram confrontadas com seus hashes; continuavam intactas.
A implementação real foi inspecionada diretamente: AdventureDefinition/Registry,
importação, tabelas, IDs, preparação/ativação, contexto, G1/G2, resolução,
publicação, contratos Zod/Pydantic e memória de falas.

Causas observadas antes da implementação:

- O menu G1/G2 e seu carregador usavam somente `snapshot.characters`.
- Cast usa key/campanha/namespace e `adventure_memories`, sem modalidade/papel
  persistidos; seu UUID não pertence às FKs de `characters`.
- A preparação substituía o plan, sem opt-in Story Card ou regra de reaplicação.
- Falas tinham atribuição textual; homônimos de cast precisavam também de uma
  referência estruturada, sem colocá-los em eventParticipants.

Antes do código, foi apresentado o diagnóstico: vínculo aditivo no JSONB,
carregador separado, HEARD conservador, revalidação existente e atribuição de
metadado. Não foi necessária migration. O teste inicial falhou em aceitar o
manifesto no schema antigo; a preservação do plano legado já passava.

Responsabilidades continuam separadas: Python interpreta e seleciona; NestJS
valida origem, escopo, fontes, composição e persistência; o motor conserva a
resolução mecânica. Não há agente por NPC, juiz LLM ou nova capacidade de escrita
para o modelo.

## B. Arquitetura implementada

[Contrato e operação detalhados](../ai/story-card-dialogue.md).

1. O operador habilita uma cena pelo comando local existente `SCENE`, acrescentando
   `storyCardDialogue`. Nenhum endpoint novo foi criado.
2. `adventures/story-dialogue.ts` valida o manifesto contra a definição armazenada,
   módulo registrado, digest, namespace, cena e identidades derivadas.
3. `narrative/story-card-dialogue.ts` consulta o cast e suas associações próprias,
   verifica elegibilidade, integra fontes com a biblioteca já existente e constrói
   respostas autorizadas. Não escreve em personagens, relações ou fichas.
4. `NarrativeContextService` acrescenta somente nomes/pares disponíveis ao menu.
   A origem STORY_CARD fica discriminada no contexto e no metadata privado da
   resolução, mantendo o caminho REGULAR.
5. PROPOSE seleciona assunto/ato; o servidor resolve o alvo exato, inclusive por
   menção. NARRATE recebe projeção mínima sem owner/manifesto/proveniência
   administrativa e escolhe beats completos.
6. Na transação final, o contexto é recomposto e a autorização integral da 5.6.2
   decide a mensagem e a memória efetivamente persistidas.

A biblioteca v1 não foi reescrita. Seus textos, condições WITNESSED e exigência de
participação continuam. O novo carregador não tenta torná-los verdadeiros por
inferência. Perfis parecidos, nomes, `card.sheet` ou relações textuais não geram
nenhuma entidade, ficha ou autorização.

## C. Contratos, versões, identidade e manifesto

`scenePlan.storyCardDialogue` é opcional e sem default. O manifesto v1 contém
campanha, definitionId `id:vN`, definitionDigest, entityNamespace, sceneKey,
proveniência revisada e até 30 vínculos. Cada vínculo identifica key e UUID,
biblioteca/contentVersion, voz, estado esperado, pares assunto/ato e até três
fontes por referência/hash. Schemas estritos recusam extras e versões desconhecidas.

A formalização difere do rascunho B.0: uma cena por manifesto, identidade da
instância no envelope e escolhas explícitas de tópico/ato por NPC. A fixture JSON
histórica não foi alterada; o helper TypeScript constrói o contrato efetivo a partir
de seus dados. Não se aceitou o rascunho como se fosse um contrato já vigente.

`adventureEntityId` continua exatamente igual. O namespace vem da instância e
precisa corresponder ao módulo registrado. A definição armazenada e a registrada
são confrontadas com o digest autorizado. Na primeira integração, o hash direto
do objeto retornado pelo JSONB recusou os vínculos válidos: a ordem das chaves não
é preservada pelo banco. A correção reaplica o **mesmo schema estrito da importação**
antes do hash; não altera a função de digest, a referência, seus valores, arrays
ou o digest histórico. Há regressão específica de roundtrip com chaves reordenadas.

O comando administrativo `SCENE` admite o manifesto, sua omissão ou `null`.
Omissão permite reaproveitar somente o manifesto anterior integralmente válido
na mesma instância/cena. `null` o revoga. Outra cena descarta a permissão; voltar
à anterior não a restaura. Dados armazenados incompatíveis falham fechados, sem
downgrade, associação por nome ou habilitação geral de Gloamhale.

Os contratos FREE e beats NARRATE não mudaram. O manifesto é preparação interna
Zod, não uma ferramenta ou campo novo do schema de geração Pydantic. O bridge
exercita a serialização real FastAPI/Pydantic → Zod/NestJS. O teste compartilhado
recusa injetar manifesto em FREE/NARRATE. OpenAPI foi exportado sem abrir portas
ou consultar banco real; eventual identidade de bytes consta das evidências.

## D. Elegibilidade e fontes

A oferta contextual exige sessão em andamento e todos estes gates atuais:

- campanha/instância/definição/versão/digest/namespace/cena correspondentes;
- key definida como INDIVIDUAL, conhecida, na cena, e UUID exato rederivado;
- estado igual ao explicitamente revisado; sem regex ou inferência de Saúde;
- único vínculo para key/UUID; duplicidade invalida o manifesto;
- ausência de colisão com UUID persistido em characters;
- assunto/ato explicitamente permitido, biblioteca v1 e fontes ainda válidas.

Uma menção KNOWN fora da cena não concede presença. Alvo ambíguo pede
esclarecimento; menção com ID exato distingue os homônimos Lior/Líor.

Memória exige associação própria em adventure_memories e evento PUBLIC da mesma
campanha. A descrição integral deve corresponder ao hash vinculado. Fontes de
outro NPC, GM_ONLY, PLAYER_ONLY e fontes removidas/alteradas não são candidatas
novas. A fonte pública de ambiente limita-se ao local atual, público e acessível,
com ID derivado da cena. Até um outro local acessível e público é recusado como
fonte de ambiente desta cena: o schema atual não comprova vínculo objeto→sala.

Sem resposta segura, usa-se CLARIFY ou o fallback existente, sem substituir uma
seleção errada por uma resposta contextual correta silenciosamente.

## E. Memória individual e proveniência

A projeção das memórias do cast é HEARD e nunca fornece participantes comprovados.
CONSEQUENCE_RECORDED, estado UNRESOLVED e associação legada não viram WITNESSED.
O catálogo pessoal de desacordo permanece indisponível, mesmo se solicitado pelo
modelo ou listado no vínculo. Esse é o resultado seguro esperado de TEST-SCARD-017,
não uma capacidade positiva fingida ou uma reclassificação de histórico.

`promise` v1 cita SPEECH_RECORDED, preservando a diferença entre ouvir, ser autor
e cumprir. Não atribui automaticamente a promessa ao NPC e não renomeia
NPC_REPLY_RECORDED para contornar o requisito do conteúdo.

A fala final recebe NPC_REPLY_RECORDED. O metadado público mínimo contém
`{speaker: {kind: STORY_CARD, entityId}}`; não é FK de participante. O comando
interno EVENT_RECORD aceita essa atribuição somente para NPC_REPLY_RECORDED.
A chamada é feita pelo resolvedor depois da autorização, não pelo LLM.
O owner completo e a proveniência de manifesto/vínculo/fragmento ficam em
`message.metadata.dialogueProvenance`, omitida pelo DTO público. A atribuição
mínima também identifica corretamente o fallback de um Story Card.

Os regulares continuam em character_knowledge/HEARD e eventParticipants. O cast
continua em adventure_memories, por key; somente indivíduos conhecidos/presentes
recebem as associações conforme a política existente. Nenhum UUID de cast foi
inserido nas FKs regulares; nenhum personagem sombra ou relação numérica foi criado.

Mensagem, réplica e respectivas associações confirmam juntas. O teste provoca
falha PostgreSQL ao inserir a mensagem final: a réplica/memória voltam, a fala da
protagonista previamente confirmada permanece e retry executa somente NARRATE.
Repetir actionId concluído não cria evento, memória ou chamada. As duas sessões
usam revisão explícita de critérios e finalização reais, sem destravar capítulos
por um patch de fixture. O histórico finalizado permanece integralmente legível.

## F. Publicação e canonicidade

Não há mudança de texto autorizado, schema de beat ou igualdade integral.
`publicationChoices` continua sendo recomposto pelo servidor; `validateRendering`
confere texto, speakerId, factIds, montagem e RESULT oficial. O catálogo/contexto
retornado pelo modelo não é autoridade. Uma réplica contextual continua sendo
uma alternativa completa, sem combinar duas para formar alegação não revisada.

No teste de corrida, o estado muda depois da geração: a réplica deixa de ser
válida, é recusada e não aparece no chat ou na memória. Publica-se fallback seguro
com a atribuição correta. Alterações de texto, interlocutor, fatos e combinação
indevida também são recusadas.

TEST-SCARD-015 executa uma investigação com teste preparado real e dado simulado,
fracassa oficialmente e injeta a galeria original no draft. Só é publicado
**“A busca não identificou nenhuma abertura.”** A galeria não entra em eventos,
memória, histórico ou progresso. Não foi usado um contexto mecânico falso para
transformar a tentativa em esclarecimento. Saúde, mundo, inventário, relações e
objetivos permanecem iguais em diálogos, inclusive quando se cita uma promessa.

Não há divulgação de card.secrets/history/goals/fears/knowledge/relationships,
Director, mecânicas privadas ou cenas futuras ao modelo da prova positiva.
Os prompts de dados efetivamente recebidos pelo provedor simulado e as mensagens
persistidas estão nas evidências. O papel das referências não foi ampliado para
autorizar frases fora do catálogo.

## G. Matriz TEST-SCARD-001–020

| ID             | Resultado offline     | Evidência/comportamento observado                                                                                | Camada                                    |
| -------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| TEST-SCARD-001 | PASS offline          | Vínculo SCENE válido, voz/fonte próprias, mensagem aceita e persistida                                           | integration positivo; unit/contract       |
| TEST-SCARD-002 | PASS offline          | Conhecido ausente, inclusive menção explícita, não responde                                                      | integration presença                      |
| TEST-SCARD-003 | PASS offline          | known=false e estado incompatível não oferecem catálogo novo                                                     | integration elegibilidade                 |
| TEST-SCARD-004 | PASS offline          | Homônimos sem ID pedem esclarecimento; IDs exatos selecionam duas vozes e autores                                | integration menções                       |
| TEST-SCARD-005 | PASS offline          | Campanha/namespace/definição/digest e chaves JSONB conferidos                                                    | unit + integration                        |
| TEST-SCARD-006 | PASS offline          | SPEECH_RECORDED próprio citado como ouvido, sem prova de cumprimento                                             | integration publicação                    |
| TEST-SCARD-007 | PASS offline          | Associação exclusiva de keeper-b não serve a keeper-a                                                            | integration memória                       |
| TEST-SCARD-008 | PASS offline          | Prompts efetivos e projeções públicas sem segredos/manifesto completo                                            | integration + bridge Python               |
| TEST-SCARD-009 | PASS offline          | Fonte removida, privada ou de outro local acessível não é autorizada                                             | integration fontes; guardas de hash G1/G2 |
| TEST-SCARD-010 | PASS offline          | Estado muda após geração: recusa, fallback atribuído e sem memória do draft                                      | integration corrida                       |
| TEST-SCARD-011 | PASS offline          | Texto, speakerId, factIds e combinação adulterados são recusados                                                 | integration quatro negativos; contract    |
| TEST-SCARD-012 | PASS offline          | Duas sessões por revisão/finalização real, replay e rollback/retry idempotentes                                  | integration ciclo de vida                 |
| TEST-SCARD-013 | PASS offline          | Sem manifesto, a réplica legada anterior permanece exata                                                         | integration + contract                    |
| TEST-SCARD-014 | PASS offline          | Versões de vínculo/conteúdo desconhecidas falham fechadas                                                        | unit/contract + JSONB inválido            |
| TEST-SCARD-015 | PASS offline          | Fracasso real do teste preparado; galeria rejeitada antes do chat/memória                                        | integration canonicidade                  |
| TEST-SCARD-016 | PASS offline          | Promessa falada não altera mundo/recursos/relações/progresso                                                     | integration invariantes + rollback        |
| TEST-SCARD-017 | PASS offline (recusa) | Associação legada/CONSEQUENCE_RECORDED não prova WITNESSED/participação; capacidade positiva permanece bloqueada | unit + integration negativo               |
| TEST-SCARD-018 | PASS offline          | Arquétipo mesmo presente e key inexistente não são interlocutores contextuais                                    | unit + integration                        |
| TEST-SCARD-019 | PASS offline          | Colisão com characters recusa o opt-in; nenhum shadow/FK/memória copiada                                         | integration físico                        |
| TEST-SCARD-020 | PASS offline          | Mesma cena revalida; troca de cena/volta não ressuscita permissão; null revoga                                   | integration SCENE                         |

Os testes estão agrupados por responsabilidade, com casos negativos e controles
positivos. Não há testes pendentes ou skips novos no runner padrão. O teste
unitário de arquétipo inclui explicitamente sua key na cena para verificar o
bloqueio por tipo, além da ausência. A variante sintética v2 coloca os dois
homônimos na cena e acrescenta o teste preparado da estante; não modifica a
fixture B.0 nem qualquer versão de Gloamhale. Uma variante unitária v3 exercita
o arquétipo presente, com identidade/digest próprios do teste.

A fixture marca a referência como sintética: páginas são rótulos lógicos, não
regras supostas de Blue Rose. Estado e associações antigas são preparados
explicitamente no banco descartável; não são extraídos de frases do modelo.
Casos de dados inválidos simulam um JSONB antigo/inconsistente diretamente no
banco de teste; vínculos bem formados usam o comando SCENE de produção.

Exemplos completos efetivamente publicados no banco descartável, selecionados
pelo provedor simulado com duas identidades/vozes distintas:

```text
Lior — Da promessa, posso retomar o que ouvi; não um resultado confirmado:
> A protagonista disse: pretendo ajudar quando puder.
```

```text
Líor — Posso retomar essa promessa com você. Ela foi dita; isso não mostra, por si só, que foi cumprida:
> A protagonista disse: pretendo ajudar quando puder.
```

[Recibo dos exemplos e prompts efetivos](../ai/phase-5.6.3b-1-story-results.json).
As citações demonstram fala ouvida, sem atribuir autoria ao NPC ou cumprimento.

## H. Verificações, cobertura e reprodução

| Verificação                              | Resultado observado                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| NestJS completo                          | **509/509**, **35/35 suítes**, exit 0, **303,88 s**, sem skips                                |
| Cobertura global API                     | statements **92,70%**, branches **84,94%**, functions **96,88%**, lines **94,14%**            |
| Validação de escopo Story Card           | lines **100%**, branches **96,66%**                                                           |
| Carregador Story Card                    | lines **98,18%**, branches **83,33%**                                                         |
| Python completo                          | **360/360**, exit 0, **8,35 s**, cobertura global **87%**                                     |
| Contratos compartilhados                 | **15/15**, exit 0                                                                             |
| Web                                      | **7/7**, exit 0                                                                               |
| pnpm typecheck / pnpm lint               | Aprovados no workspace                                                                        |
| pnpm contracts:api / pnpm build          | Aprovados; build global inclui Next.js, API, contratos e Python                               |
| pnpm format:check                        | **FAIL preexistente**, 19 arquivos históricos sem alteração; não foram ignorados/reformatados |
| git diff --check / formatação do recorte | Aprovados                                                                                     |

A rodada completa acrescenta sete testes Jest de unidade/contrato e 17 de
integração aos 485 anteriores; os 20 TEST-IDs são requisitos agrupados, não uma
contagem artificial de testes. A suíte anterior não foi substituída por soma de
runs parciais.

A formatação global falha nos mesmos arquivos de evidência/gabarito históricos
com bytes iguais à fotografia inicial. Eles não foram alterados nem adicionados
a ignores para obter aprovação. A lista exata está no sumário. Isso é uma
pendência do workspace, não uma falha ocultada do teste do adaptador.

Comandos executados da raiz, com `.tools/node_modules/.bin` no PATH:

```sh
node scripts/test-integration.mjs --coverage
node scripts/uv.mjs run pytest --cov=app --cov-report=term-missing
pnpm typecheck
pnpm lint
pnpm --filter @solo-rpg/shared-contracts test
pnpm --filter @solo-rpg/web test
pnpm contracts:api
pnpm build
pnpm format:check
git diff --check
```

A integração nova atravessa HTTP NestJS, FastAPI `/internal/turn` com autenticação
sintética em TestClient, grafo LangGraph/Pydantic de produção e PostgreSQL real
descartável. O provedor é ScriptedProvider, sem SDK; a rede externa é bloqueada
nesse bridge. O ASGI é local/em memória, não um servidor Gemini ou browser.
As demais regressões incluem testes do SDK com transportes em memória.
Isso não mede interpretação semântica Gemini nem qualidade literária real.

O runner usa container/volume únicos `solorpg-test-*`, migrations existentes,
porta local efêmera e banco solorpg_test; não usa banco de campanha real.
Build/exportação de contratos usam somente compilação e criação do documento;
a exportação recebeu uma URL de banco inerte no processo, sem mudar .env.
O build inicial restrito encerrou no Next.js sem diagnóstico detalhado; repetido
com subprocessos locais permitidos, passou sem correção de produção. Testes
Node foram confirmados com essa permissão, em vez de contar apenas os arquivos.

Ocorrências intermediárias: regressão inicial vermelha do contrato, recusa pelo
hash de JSONB antes da correção, imports/atribuições incorretos na elaboração dos
testes corrigidos por typecheck/lint. As expectativas de segurança foram mantidas.
As consultas de snapshots no teste novo têm ordenação explícita, preservando
igualdade integral dos registros. Nenhum teste anterior foi desativado ou alterado.

[Recibos](../ai/phase-5.6.3b-1-test-receipts.json) e
[sumário estruturado](../ai/phase-5.6.3b-1-validation-summary.json) contêm comandos,
resultados, saídas preservadas, hashes e a classificação das limitações.

## I. Compatibilidade

Planos antigos não recebem um manifesto default; Gloamhale não recebe opt-in por
nome/perfil. A campanha legada sem vínculo usa a mesma réplica pública anterior.
O caminho REGULAR mantém carregador, templates, fontes, wire e efeitos anteriores.
A memória do cast não é copiada para regulares nem vice-versa. Relações de card
não viram métricas e card.sheet não vira ficha; vida/disponibilidade mecânica de
cast continua dependência futura, sem inventar Saúde pelo texto de currentState.

Os 58 textos publicados A e os 58 textos B foram reproduzidos integralmente
na execução final, com as mesmas mensagens/ordem por cenário e seletor. A
comparação ignora IDs aleatórios, não o texto. Os artefatos históricos não foram
sobrescritos. As duas exportações OpenAPI existentes permanecem byte a byte
iguais depois da exportação API solicitada.

Sem migration, reimportação ou modificação de definições/digests de aventuras.
Os contratos novos são internos e aditivos; API/contratos devem ser instalados
juntos. Não houve alteração de Python de produção, SDK, modelo, billing, fallback
ou chaves. Os arquivos novos Python são apenas avaliação/testes offline.

## J. Arquivos, rollback e preservação

| Arquivo/grupo                                                                                                      | Justificativa                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| shared-contracts/src/dialogue.ts; narrative.ts                                                                     | Schema interno aditivo de manifesto/owner, sem defaults legados                 |
| adventures/story-dialogue.ts (novo)                                                                                | Integridade de escopo/versão/identidade, incluindo roundtrip JSONB              |
| narrative/story-card-dialogue.ts (novo)                                                                            | Carregamento por origem e fontes PUBLIC/HEARD próprias                          |
| adventures/execution.ts; adventure.service.ts                                                                      | SCENE opt-in/null e reaplicação limitada à cena                                 |
| sessions.service.ts; narrative/resolution.service.ts                                                               | Passam o registro à preparação; origem e persistência atribuídas                |
| narrative/context.service.ts; free-action.ts                                                                       | Menu, origem resolvida e catálogo atual do cast                                 |
| narrative/rendering.ts; narrative.service.ts; dialogue-content.ts                                                  | Projeção mínima ao modelo e proveniência privada; igualdade integral preservada |
| game-engine/commands.ts; game-engine.service.ts                                                                    | Metadado mínimo opcional de autoria de NPC_REPLY, sem mecânica/FK nova          |
| test/story-card-dialogue.spec.ts; integration/story-card-dialogue.spec.ts; fixtures/story-card-dialogue.ts (novos) | Matriz, authoring real, persistência e negativos                                |
| shared-contracts/test/story-card-dialogue.test.cjs (novo)                                                          | Contrato estrito e separação dos canais                                         |
| ai-service/app/evaluation/story_dialogue_replay.py; tests/test_story_dialogue_bridge.py (novos)                    | Bridge offline HTTP/grafo com provedor roteirizado e rede bloqueada             |
| Documentos/artefatos B.1; registro de testes; contextual-dialogue.md                                               | Operação, evidências e estado dos TEST-IDs                                      |

A fotografia SHA-256 inicial inclui **419 arquivos preexistentes**. Desses,
**404 permanecem byte a byte iguais**; as 15 alterações são os arquivos de
produção/contrato e os dois documentos correntes descritos acima. A lista exata
está no sumário. Caches, dependências, builds e cobertura são excluídos da
fotografia; não são histórico de campanha.

Permanecem intactos: .env/.env.example, PDFs (quatro), configurações/modelos/
provedores/fallback, definições de aventura/digests/ID histórico, migrations,
regras Blue Rose, Director, dados de referência, todos os testes anteriores e
recibos/relatórios históricos. A fixture de planejamento B.0 não foi alterada.
O NPC regular de colisão é inserido **explicitamente pelo teste sintético** no
banco descartável, não criado pelo adaptador. A prova positiva conserva somente
a protagonista na tabela characters.

Rollback seguro: manter a API com a fronteira 5.6.2, drenar ações pendentes e
revogar os manifestos via SCENE com storyCardDialogue null. Preservar chats,
eventos, IDs e memórias; não repetir mecânicas. Antes de um binário antigo com
schema estrito de planos, remover os novos vínculos pelo código compatível.
Não houve deploy, rollback, edição de campanha real ou migração operacional.

## K. Pendências e recomendação

- WITNESSED, participação pessoal e autoria não demonstradas continuam bloqueadas.
  Eventual prova estruturada para eventos novos exigirá escopo próprio; não
  reclassificar memórias legadas para ativar os fragmentos pessoais.
- A biblioteca v1 limita os assuntos/atos disponíveis; sua pertinência depende da
  preparação revisada. Hash assegura integridade, não verdade/qualidade da fonte.
- Fonte ambiental nova limita-se ao local atual; vínculo objeto→sala precisa de
  representação autorizada antes de ampliar o recorte.
- A edição opt-in é administrativa/local, sem CRUD/UI de personagens. Não há
  party autônoma, conversão de sheet ou novo agente. Não se iniciou 5.7/5.8.
- Qualidade literária, repetição entre turnos e seleção real do Gemini requerem
  avaliação separada, autorização nova e revisão humana. Não se reutilizou o
  orçamento antigo de probes.
- Preservar a pendência de formatação histórica descrita em H; não maquiar uma
  verificação global falha nem reformatar recibos congelados para obter verde.

Recomenda-se revisão do operador deste adaptador, dos exemplos publicados e dos
limites. A infraestrutura demonstra seleção/publicação seguras de conteúdo
contextual para Story Cards no recorte autorizado; não demonstra representação
perfeita dos NPCs. Nenhuma Fase 5.6.3C, 5.7 ou 5.8 foi iniciada automaticamente.
