# CAOS · Marco A.1.3.1

## Diagnóstico da abertura

A biblioteca recuperava a mesma instância guiada e a mesma Sessão I ao voltar à aventura. O backend identifica uma sessão iniciada por `startedAt`. Um novo pedido de início para essa sessão devolve o estado existente, sem executar a publicação novamente. O diário carrega as mensagens persistidas por número de sequência e exibe o conteúdo armazenado na primeira entrada.

A revisão `gloamhale-travel-a1-3-v1` é compatível com o planejamento `gloamhale-editorial-2`. A operação de início em uma execução fixada no planejamento anterior escolhe a abertura canônica da cena, registrada como `canonical-scene-v1`. Em uma reprodução com a revisão anterior, o Chromium carregou a primeira abertura normalmente e continuou mostrando o mesmo texto ao retornar. A API devolveu o mesmo identificador e a mesma entrada após um segundo pedido de início. O resultado é compatível com o versionamento e não mostrou falha de recuperação ou renderização.

A API da instalação observada não respondeu nas portas configuradas durante esta verificação. A revisão daquela partida específica ficou sem confirmação. A reprodução e todos os testes de escrita ocorreram em bancos descartáveis.

## Reinício e persistência

O diário mostra **Reiniciar sessão** ao lado das ações de sessão, inclusive para a Sessão I concluída ou pausada da biblioteca. O diálogo nativo abre com foco em **Cancelar**, contém o aviso de perda de progresso e exige o botão destrutivo **Apagar progresso e reiniciar**. Cancelar, Escape e Enter sobre o foco inicial fecham o aviso sem enviar a operação.

O endpoint `POST /api/v1/campaigns/{campaignId}/sessions/{sessionId}/reset` exige `{"confirm":true}`. O backend aceita somente a Sessão I já iniciada da execução selecionada na biblioteca. Campanhas independentes do histórico ficam fora do escopo desse comando.

Uma transação serializa o acesso ao lugar da aventura na biblioteca, bloqueia a campanha e a sessão antigas, cria uma execução limpa com novos identificadores, exclui a execução anterior e registra a substituição. As exclusões são filtradas pela campanha ou pelos identificadores de registros pertencentes a ela. As FKs restritivas fazem qualquer dependência não atendida abortar a transação. A tabela `library_session_resets` conserva a identidade antiga e a nova, a ordem das substituições e as revisões de planejamento e abertura. O registro permite repetir a confirmação sem produzir uma terceira execução e impede que uma importação tardia recrie a antiga. As chamadas de diário, envio e processamento com identificadores descartados falham com 404, inclusive quando uma resposta de IA já estava em trânsito.

A confirmação redireciona para a seleção da protagonista. Caso a resposta HTTP seja perdida, a interface consulta a biblioteca para localizar o resultado confirmado. Na recarga, uma marca local criada pelo clique explícito permite fazer a mesma consulta sem reenviar o comando destrutivo. A seleção transcreve as fichas-preset quando necessário. Escolher os companheiros e iniciar usa a preparação existente, com nova revisão da ficha, validação da abertura e publicação única.

A nova execução importa a versão de aventura oferecida pela biblioteca e fixa o planejamento editorial vigente. Neste marco, a ficha de Naelis é vinculada no preparo e a abertura `gloamhale-travel-a1-3-v1` é publicada quando a nova sessão começa. As sessões II–VII permanecem bloqueadas. A mudança de revisão ocorre por reinício explícito ou abertura de uma execução nova.

### Escopo dos dados

| Apagados da execução substituída                                                                                                   | Preservados                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Sessões, diário, pensamentos, fila, ações, planos, lotes, recibos de comandos da partida e métricas de uso ligadas aos seus turnos | Catálogo da biblioteca e outras campanhas, inclusive sessões e recibos independentes                         |
| Instância narrativa, progresso, evidências, eventos, localização, elenco, relações, memórias, conhecimento e descobertas           | Planejamento editorial, definições importáveis v1–v5, Story Cards, fichas-preset e catálogo global de regras |
| Fichas da execução, inventário, recursos, testes, rolagens, combate, arcanos, Saúde, condições e montarias                         | Arquivos, manifestos e artefatos globais de avaliação                                                        |
| Conteúdo da execução anterior                                                                                                      | Recibo mínimo do reinício com identificadores e versões, sem diário ou contexto de jogo                      |

A migração aditiva `0014_session_reset.sql` deve ser aplicada antes de iniciar a API atualizada. Nenhuma migração ou exclusão foi executada na partida real. Uma vez confirmado, o reinício exclui os dados operacionais antigos. A migração e a tabela de substituições precisam permanecer instaladas enquanto houver execuções substitutas na biblioteca.

## Pensamentos e participação composta

O pensamento é identificado pelo modo `THINK`. A jogadora conserva a própria redação no diário. No fluxo da fila, processá-lo apenas retira a marca de pendência. O conteúdo fica fora dos pedidos de IA, das falas, dos eventos, da mecânica e do conhecimento dos NPCs. A continuação pode considerar as falas e ações confirmadas anteriormente no lote. Una ainda não interpreta o texto do pensamento na prosa. Para uma integração futura, a opção a avaliar é uma passagem exclusivamente privada, com projeção separada da narração compartilhada e sem acesso a ações, evidências ou memória de NPCs. Enviar o pensamento ao mesmo contexto que produz falas de NPCs dependeria de uma separação que o fluxo atual não oferece.

Antes deste marco, o processamento em ordem publicava uma entrada por resolução. Agora, **Enviar** só grava o diário e a fila. **Continuar** fixa uma sequência, valida e resolve cada mensagem em ordem e reúne os trechos autorizados em uma continuação publicada no diário. O leitor recebe uma única entrada para o trecho processável. Os fragmentos individuais preservam os vínculos de validação, eventos e recibos da fronteira 5.6.2. Eles ficam fora da consulta pública do diário. Uma pergunta no modo Una conserva a indicação **Esclarecimento de Una**, inclusive quando aparece junto de trechos ficcionais. A montagem reúne trechos validados e não usa uma nova geração de IA para reescrevê-los.

O backend usa recibo e posse temporária do lote para serializar chamadas concorrentes. Quando uma resolução depende de rolagem ou façanha, o prefixo autorizado pode ser publicado e as mensagens dependentes continuam aguardando. Se o provedor falhar, **Continuar** retoma o lote e reaproveita os recibos já gravados. Um pedido de teste sem opção preparada pede contexto e não confirma efeito. Também foi corrigida a autorização e a passagem para a publicação da ação explícita **Desço do cavalo**, descoberta no percurso com ação mecânica real.

**Continuar** sem mensagens pode apresentar a estrada uma vez após a abertura autoral. Sem um próximo trecho autorizado, o motor mantém o contexto ou registra uma espera sem acontecimento. Uma pendência mecânica impede que a continuação vazia apresente um novo trecho. Repetições da espera não modificam o progresso e não criam decisão, deslocamento ou passagem de tempo para Naelis.

## Verificação offline

- **PostgreSQL descartável e cliente de IA simulado** — 74 testes em sete suítes. A suíte de reinício cobre reprodução editorial, confirmação obrigatória, troca de identidade, exclusão por escopo, recursos alterados, morte e restauração da montaria, eventos e progresso, perda de filas, preservação de definições e de outra campanha, falha de banco injetada depois das exclusões dependentes, concorrência e resposta tardia. A suíte também inspeciona os registros do diário durante e depois de uma sequência `THINK → SPEAK → ACT` e verifica que uma pendência mecânica bloqueia uma continuação vazia. As outras suítes cobrem Gloamhale, Director, Blue Rose, contratos, arquitetura, digests e publicação 5.6.2.
- **Chromium com Next, Nest, PostgreSQL descartável e serviço Una HTTP simulado** — dois percursos concluídos. O primeiro cancela por botão, Escape e Enter, simula perda da resposta de reinício e confirma a abertura vigente com Aren. O segundo pausa, recarrega e retoma três mensagens ordenadas, verifica uma única continuação, conclui a rota direta, recarrega com a resposta do reinício ainda pendente e recomeça sem companheiros. Ambos conferem a seleção, o diário e os bloqueios editoriais.
- **Web e verificações estáticas** — três arquivos de testes web, build TypeScript da API, tipagem web, lint do recorte, contrato OpenAPI e `git diff --check`.

Para repetir a suíte de API, use `scripts/test-integration.mjs` com as suítes `session-reset`, `gloamhale`, `phase562-publication`, `architecture-boundaries`, `domain`, `adventure-history` e `queued-interaction`. Para repetir o navegador, inicie Next e Nest com as migrações em um banco local descartável `caos_reset_e2e_<id>` do usuário `test` e um serviço de teste que devolva apenas propostas `OBSERVE` ou a narração confirmada pelo motor. Defina `CAOS_TEST_E2E_DATABASE_URL`, `CAOS_TEST_WEB_URL`, `PLAYWRIGHT_MODULE` e, conforme a instalação, `CAOS_TEST_CHROMIUM`. Execute `node --test apps/web/e2e/session-reset.mjs`.

Nenhuma chamada ao Gemini foi realizada. A abertura vigente, a seleção opcional da party e os critérios de progressão de A.1.2 permanecem em vigor. O Marco C.4A continua pendente.

## Referências no repositório

- [Reinício e exclusão por execução](../../apps/api/src/campaigns/campaigns.service.ts), [ordem de exclusões](../../apps/api/src/campaigns/delete-execution.ts), [migração](../../apps/api/drizzle/0014_session_reset.sql)
- [Confirmação no diário](../../apps/web/src/components/session-reset-dialog.tsx), [composição da continuação](../../apps/api/src/narrative/narrative.service.ts)
- [Integração PostgreSQL](../../apps/api/test/integration/session-reset.spec.ts), [percursos Chromium](../../apps/web/e2e/session-reset.mjs), [validação anterior](./caos-mvp-marco-a1-3-narrative-interaction.md)
