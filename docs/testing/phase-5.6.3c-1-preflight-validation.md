# KHAOS — Fase 5.6.3C.1: preflight do executor literário

02/11/2026. Entrega da infraestrutura, exclusivamente offline. **Nenhuma chamada
real Gemini/Groq e nenhuma rodada externa autorizada por esta implementação.**
O plano C.0 e seus gabaritos permanecem íntegros. Qualidade literária/seleção
real do Gemini continuam pendentes. Não se implementaram G3/G4/G5/G6, 5.7 ou 5.8.

## A. Diagnóstico e arquitetura

Foram lidos validação/protocolo/plano C.0, B.1, publicação 5.6.2, documentação
PROPOSE/NARRATE, seleção contextual, adaptador e política de autorização dos
provedores. As leituras foram confrontadas com grafo, router, GeminiProvider,
Pydantic/Zod, interpretFreeAction e validateRendering. O diagnóstico foi
apresentado antes das edições:

- O grafo recupera INVALID_RESPONSE em PROPOSE com CLARIFY e remonta a string
  redundante narrative em NARRATE. A resposta posterior não serve de recibo bruto.
- GeminiProvider não conserva o texto original ou model_version em seu resultado
  tipado; seus contadores zero não distinguem sempre uso ausente de zero informado.
- ProviderRouter limita uma instância; isso não impõe sozinho o teto da rodada.
- Os seis casos são projeções congeladas. É possível reusar as políticas reais
  NestJS sem importar AppModule, banco ou executor do motor.

Decisão implementada: instrumentação restrita ao processo de avaliação, ledger
global de tentativas, replay Node somente leitura e artefatos exclusivos. Nenhum
arquivo de produção foi editado. Não há prompt, renderer ou classificador paralelo.

## B. Executor

Entrada única: [plano C.0 congelado](../ai/phase-5.6.3c-1-live-plan.json), SHA-256
`04c31b43e50bd39573e75529590f5c33128d806e426930858263b40a8b93d712`.
Os casos são C1-1/2/3 Iria, C1-4/5 Lior e C1-6 Tessa. Ordem, mensagens, contextos,
expectativas, fontes e catálogos são exatamente os do plano.

[literary_executor.py](../../apps/ai-service/app/evaluation/literary_executor.py):

1. Verifica plano, catálogo, 18 hashes congelados e identidade da infraestrutura.
2. Confere os seis casos no replay compilado NestJS, antes de qualquer provedor.
3. Em modo real, exige nova autorização vinculada à chave, projeto atestado,
   manifesto revisado e roundId novo. O modo padrão só executa preflight.
4. Cria claim e diretório exclusivos; grava reservas duráveis antes do SDK.
5. Passa somente proposeRequest/narrateRequest ao grafo de produção.
6. Captura o retorno SDK original; verifica Pydantic original, Zod original,
   seleção categórica, autorização e publicação separadamente.
7. PROPOSE inadequado não recebe NARRATE, correção, substituição ou caso extra.
8. Grava events.jsonl append-only, result.json e human-review.json exclusivos.

A identidade da infraestrutura está no
[manifesto](../ai/phase-5.6.3c-1-executor-manifest.json): executores, bridge,
helpers de avaliação reutilizados, teste novo, políticas compiladas, contratos
compilados e lockfiles. O hash do manifesto deve ser aprovado para a rodada e
continua sendo verificado entre etapas. Arquivos congelados nunca são
rebaselined para corrigir uma divergência. O manifesto não concede autorização.

O plano conserva a descrição histórica “executor não implementado em C.0”. Esta
entrega adiciona o executor separado; não reescreve essa evidência, limites ou casos.

## C. Contratos e grafo de produção

O caminho é run_turn → ReservedProvider → ProviderRouter de produção, com
max_requests=1 por estágio → GeminiProvider de produção → SDK oficial. MASTER,
NARRATOR, projeção planner_request, schema remoto e parsing local permanecem os
mesmos. As opções SDK continuam com attempts=1: zero retries adicionais.

O wrapper apenas reserva orçamento, observa o retorno e impõe paradas operacionais;
não melhora nem substitui uma proposta. O teste inspeciona o request HTTP do SDK:
systemInstruction é o prompt de produção e contents é exatamente a serialização
produzida pelo grafo. Nenhum gabarito/rubrica/nota é anexado ao prompt.

O [bridge Node](../../scripts/evaluate-literary-case.mjs) importa os contratos
compartilhados compilados, interpretFreeAction, publicationChoices e
validateRendering. Não importa banco, serviços de campanha ou Game Engine.
O caso é relido do plano por caseId; um contexto fornecido pelo chamador não
substitui o contexto congelado. Não há endpoint novo ou contrato público alterado.

PROPOSE: Zod recebe o JSON original, e a autorização usa a proposta original
validada. A comparação do avaliador cobre somente os campos definidos no plano,
incluindo expressão, alvo e assunto/ato. Descrição não exige wording idêntico;
sua adequação semântica ampla fica para revisão humana. Match categórico não é
prova completa da interpretação do português.

NARRATE: registra validação do JSON original e validação do resultado realmente
montado pelo grafo. Se o grafo corrige narrative a partir dos beats, a divergência
permanece explícita e não conta como seleção integral correta do modelo.

## D. Captura bruta e recibos

[literary_capture.py](../../apps/ai-service/app/evaluation/literary_capture.py)
observa client.aio.models.generate_content dentro do processo isolado do executor.
O resultado SDK é devolvido ao adaptador sem alteração nos caminhos válidos.
rawText é o texto JSON recebido pelo adaptador **antes de Pydantic, recuperação e
montagem do grafo**, com hash próprio. Não é reconstruído a partir de model_dump.
Não se captura o envelope HTTP completo, cabeçalhos, chave ou conta financeira.

Cada tentativa registra caseId/etapa, provedor/modelo solicitados, reportedModel,
rawText quando seguro/disponível, parsing/errors, structuredOriginal, graphResponse,
resolução NestJS, validações original/publicação, fallback, tokens informados,
usageReported, latência e código de erro sanitizado. Nenhum zero é inventado para
uso desconhecido: ausência vira null; zero explicitamente informado é conservado.

Raw-response é gravado antes do replay Node; falha local posterior conserva a
captura no journal. A reserva também já está durável. Credencial/sentinela privada
ou detalhe financeiro detectados interrompem a rodada; o texto é retido apenas
como hash, com rawWithheldReason, sem copiar o segredo para o recibo. Erros SDK
são classificados em memória, sem persistir mensagens/cabeçalhos de exceção.
Essa exceção de sigilo é explícita; não se apresenta texto substituído como original.

O recibo diferencia falha de seleção, bloqueio seguro do backend, rejeição
estrutural e fallback. Uma graphResponse CLARIFY de recuperação não transforma
rawText inválido em acerto. Um fallback autorizado também não concede aprovação.

## E. Orçamento e interrupções

| Limite da rodada      | Implementação                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Provedor/modelo       | Somente Gemini / gemini-3.5-flash-lite                                                                                               |
| Requisições           | Até 12, com 6 slots PROPOSE e 6 NARRATE, um por caso/etapa                                                                           |
| Entrada               | Até 65.000 caracteres no prompt por requisição                                                                                       |
| Saída configurada     | 700 PROPOSE; 1.200 NARRATE; soma máxima 11.400                                                                                       |
| Retry/fallback/reparo | Zero; SDK attempts=1, router por estágio=1, fallback proibido                                                                        |
| Continuação           | Por padrão interrompe na primeira falha semântica; continuar casos independentes exige aprovação explícita adicional na mesma rodada |

Budget reserva slots atomicamente, confere limites e soma os tetos configurados
antes do SDK. NARRATE precisa da liberação do PROPOSE/NestJS. Slot usado/retirado
não é reaberto e não pode financiar outra chamada. A soma de limites de saída
não representa consumo total, entrada, thinking ou custo.

Paradas: autenticação, 429, problema/incerteza financeira, modelo reportado
diferente ou não verificável, schema crítico, informação privada, risco de efeito,
drift de hash, orçamento ou falha de replay. Não há aliases de modelo aceitos
silenciosamente. A inspeção financeira conservadora é um bloqueio operacional,
não um classificador literário nem prova do estado da conta.

## F. Segurança financeira

O ambiente normal permanece com confirmação financeira false. authorize cria
somente uma cópia de Settings para aquele processo, após todos os gates:

- autorização nova para a rodada;
- confirmação do operador de projeto gratuito e faturamento desativado;
- identificação atestada do projeto e SHA-256 da chave ativa correspondente;
- provedor/modelo/fallback atuais corretos;
- hash da infraestrutura revisada correspondente à autorização;
- roundId/destino novos e orçamento funcional.

O fingerprint vincula a autorização à mesma chave, sem expô-la. Não demonstra o
tier do projeto: conforme a política existente, isso depende da confirmação do
operador. Ausência/divergência dessas informações bloqueia antes do SDK. Não se
consultou painel financeiro, alterou billing ou habilitou flag persistente.

Dry-run usa chave sintética explícita, SDK real com httpx.MockTransport e bloqueio
próprio de socket.connect/connect_ex/create_connection. Não usa a chave ativa para
requisições. Os SDK invocations simulados não são chamadas reais Gemini.

## G. Matriz TEST-C1-001–016

Todos os pontos abaixo têm testes executados no
[teste do executor](../../apps/ai-service/tests/test_literary_executor.py), com
transporte em memória, grafo/SDK/router de produção e bridge Node real.

| TEST-ID     | Resultado offline e evidência                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TEST-C1-001 | Reserva durável antes do HTTP, 12 slots/6+6/11.400; concorrência, entrada excedida, saída incorreta e slot retirado recusados          |
| TEST-C1-002 | Assunto incorreto: seleção reprovada, CLARIFY NestJS e nenhuma NARRATE do caso; modo independente explicitamente simulado usa 11 slots |
| TEST-C1-003 | JSON inválido/kind inválido/campos incompatíveis preservados; raw Pydantic/Zod reprovam mesmo quando grafo recupera CLARIFY            |
| TEST-C1-004 | Modelo reportado diferente ou ausente interrompe após uma tentativa; nenhum switch                                                     |
| TEST-C1-005 | HTTP 429/401/403 e falha financeira interrompem, uma tentativa, sem retry/fallback                                                     |
| TEST-C1-006 | Gates financeiros/chave/projeto/manifesto, execução real sem autorização bloqueada antes do SDK, cópia financeira somente no processo  |
| TEST-C1-007 | JSON original diverge da montagem do grafo sem ser substituído; captura persiste após falha local; uso ausente/parcial é null          |
| TEST-C1-008 | Payload HTTP inspecionado: somente requests oficiais e prompts de produção; campos privados do avaliador ausentes                      |
| TEST-C1-009 | Acréscimo da galeria é rejeitado; regressão original do fracasso também reexecutada no NestJS/PG                                       |
| TEST-C1-010 | Três speakerIds distintos; speaker estrangeiro recusado, sem troca de Iria/Lior/Tessa                                                  |
| TEST-C1-011 | factIds próprios, citação de fala de Lior como HEARD, memória estrangeira recusada; regressões do loader/cast reexecutadas             |
| TEST-C1-012 | Replay não possui executor de efeitos/DB; magia no SPEAK congelado é bloqueada; sinal de risco injetado interrompe globalmente         |
| TEST-C1-013 | Alteração em cópias do plano, catálogo ou prompt bloqueia antes de requests; originais intactos                                        |
| TEST-C1-014 | Diretório exclusivo, ledger por roundId, CLI recusa reutilização e preserva bytes anteriores                                           |
| TEST-C1-015 | Fala genérica pode ser estruturalmente aceita e falhar na escolha preparada; pertinência/notas humanas continuam null                  |
| TEST-C1-016 | Métricas usam somente a saída recomposta/fallback; galeria no draft não entra na distribuição de fragmentos                            |

Limite do teste de risco: os seis casos são SPEAK. Uma magia proposta nesse
contexto é realmente bloqueada pelo interpretador; não se alterou o caso para
obter ação mecânica. Um teste separado injeta um sinal de risco no replay para
verificar a parada do executor, sem fingir que esse sinal veio da política normal.

## H. Resultados dos testes

| Verificação executada            | Resultado                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------- |
| Python dirigido, 6 arquivos      | **171/171**, exit 0, **35,73 s**; inclui **40 testes do executor**               |
| Cobertura dos dois módulos novos | **90%** conjunta; executor **88%**, captura **99%**; não é cobertura global      |
| NestJS dirigido, 6 suítes        | **103/103**, exit 0, **96,191 s**, com PostgreSQL descartável                    |
| Contratos compartilhados         | **15/15**, exit 0                                                                |
| Builds API/shared/Python         | Passaram                                                                         |
| Typecheck e lint do workspace    | Passaram                                                                         |
| CLI dry-run final                | 12 reservas, 6+6, teto configurado 11.400; **zero requests reais**               |
| Preflight sem flags              | Sem requests; modelo/fallback/normal financial protection conferidos             |
| Formatação e git diff --check    | Recorte verificado nos recibos; falha global histórica de 19 arquivos preservada |

Não se reexecutou a suíte global nem testes web nesta entrega. O frontend não
mudou. Os 103 casos incluem os 17 de integração Story Card e 11 canônicos, mais
unidades e o laboratório C.0. Nenhum teste anterior foi excluído ou enfraquecido.
A [demonstração SDK offline](../ai/phase-5.6.3c-1-offline-demo.json) preserva os
12 retornos brutos sintéticos, e o [journal](../ai/phase-5.6.3c-1-offline-demo-events.jsonl)
mostra as reservas anteriores às tentativas. A
[ficha humana](../ai/phase-5.6.3c-1-human-review-template.json) continua sem notas.

A evidência é dirigida, não uma nova aprovação consolidada de toda a suíte do
monorepo. A baseline C.0 informou 103 NestJS dirigidos, 39 Python dirigidos e 15
contratos. Esta entrega reexecuta as fronteiras pertinentes e acrescenta o executor;
não converte a baseline global B.1 em uma execução atual.

Intermediários: o primeiro run novo teve 31 acertos e uma expectativa errada sobre
magia em SPEAK; a política bloqueava corretamente a ação. O teste foi corrigido
para refletir esse bloqueio, mantendo os casos oficiais. O lint identificou o uso
de structuredClone sem declaração no escopo ESLint dos scripts; a cópia JSON local
foi usada para os contextos JSON, sem mudar a configuração de lint ou produção.
As execuções finais e a falha histórica de formatação constam dos recibos.

## I. Compatibilidade e fronteira 5.6.2

Sem mudanças em grafo, prompts, SDK adapter, router, schemas Pydantic/Zod, G1/G2,
Story Cards, motor, Director, regras ou definições/digests de Gloamhale. Sem
migration/dependência/serviço novo e sem escrita em campanha real. Os 18 arquivos
congelados do plano continuam com seus hashes originais; o plano inteiro também.

O bridge recompõe o catálogo usando o RenderingContext congelado e exige a mesma
igualdade integral de texto, speakerId, factIds e montagem. O catálogo retornado
pelo modelo não é autoridade. Atribuição/referências são verificadas nas projeções
frozen; não se inventa owner privado removido pela projeção Story Card. O replay
não certifica nova persistência de provenance: isso permanece protegido pelas
integrações B.1 com banco descartável, incluindo rollback/idempotência.

A regressão da galeria mantém “A busca não identificou nenhuma abertura” como
resultado literal autorizado. Texto rejeitado não entra no chat, memória, histórico
ou progresso nas integrações reexecutadas. A avaliação C.1 não afrouxa isso para
melhorar naturalidade ou para aceitar uma saída do modelo.

## J. Limitações literárias

As seis projeções não são campanha, sessão completa, estado evolutivo, histórico
adaptativo ou avaliação de todas as regras. A expressão continua restrita aos
fragmentos autorizados; a rodada mede seleção/publicação nessa arquitetura.

Escolher um beat preparado é uma propriedade da seleção de catálogo, não uma nota
de relevância literária por comparação de palavras. Mesmo um beat preparado pode
ser pouco pertinente. Descrição da proposta, pertinência, naturalidade, voz,
continuidade, variedade, prosa e ritmo exigem leitura humana citada. A rubrica da
C.0 e seus eliminatórios são reutilizados; nenhuma nota é atribuída automaticamente.

human-review.json contém os seis casos e dimensões com notas/justificativas null.
Casos não produzidos ficam não avaliados. O relatório mostra casos falhos ou não
tentados e separa métricas por sequência A/B/C. A distribuição agregada não é
apresentada como conversa adaptativa única nem capacidade criativa total do Gemini.

## K. Comandos reproduzíveis e arquivos

Comandos offline, a partir da raiz, com `.tools/node_modules/.bin` no PATH:

```sh
pnpm --filter @solo-rpg/shared-contracts build
pnpm --filter @solo-rpg/api build
pnpm --filter @solo-rpg/ai-service build
node scripts/uv.mjs run python -m app.evaluation.literary_executor
node scripts/uv.mjs run python -m app.evaluation.literary_executor --dry-run --output-dir /tmp/khaos-c1-new-dry-run
node scripts/uv.mjs run pytest tests/test_literary_executor.py tests/test_literary_preparation.py tests/test_gemini_schema.py tests/test_contextual_dialogue.py tests/test_story_dialogue_bridge.py tests/test_phase562.py -q --cov=app.evaluation.literary_executor --cov=app.evaluation.literary_capture --cov-report=term-missing
node scripts/test-integration.mjs --runTestsByPath test/literary-evaluation.spec.ts test/phase562-publication.spec.ts test/dialogue-content.spec.ts test/story-card-dialogue.spec.ts test/integration/story-card-dialogue.spec.ts test/integration/phase561-canonicity.spec.ts
pnpm --filter @solo-rpg/shared-contracts test
pnpm typecheck
pnpm lint
pnpm format:check
git diff --check
```

Usar destino novo. Ledger em `.tools/evaluation-rounds` é claim de uso, não
autorização financeira. Não remover claims para repetir tentativas. O manifesto
é artefato revisado da infraestrutura; rebuild idêntico mantém seus hashes.
Mudança legítima da infraestrutura exige novo preflight/revisão, não regeneração
silenciosa de hashes para permitir outra versão ou caso.

| Arquivo                                                   | Motivo                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| app/evaluation/literary_executor.py (novo)                | Gates, orçamento global, journal, grafo/router, replay e CLI |
| app/evaluation/literary_capture.py (novo)                 | Observação SDK antes do parsing; uso desconhecido e sigilo   |
| scripts/evaluate-literary-case.mjs (novo)                 | Schemas e políticas NestJS de produção somente leitura       |
| tests/test_literary_executor.py (novo)                    | Matriz C1, HTTP em memória, CLI e interrupções               |
| executor-manifest.json; baseline-sha256.json (novos)      | Identidade da infraestrutura e fotografia inicial preservada |
| Relatório/recibos/resumo/demonstração offline C.1 (novos) | Evidência reproduzível, sem sobrescrever histórico           |
| docs/testing/narrative-tests.md                           | Acréscimo ao índice corrente de testes                       |

A fotografia inicial preservada contém **443 arquivos preexistentes**. A comparação
final identifica apenas o acréscimo no índice corrente de testes; os demais
**442 permanecem byte a byte iguais**. A fotografia inicial completa está no
[baseline SHA-256](../ai/phase-5.6.3c-1-baseline-sha256.json), conservada fora de /tmp.
As alterações anteriores, inclusive arquivos ainda não commitados, foram preservadas.
Todos os arquivos de produção, contratos, fontes/recibos históricos, .env, quatro
PDFs, regras, definições/digests e Director estão intactos.

[Recibos](../ai/phase-5.6.3c-1-preflight-test-receipts.json) e
[sumário](../ai/phase-5.6.3c-1-preflight-summary.json) guardam os comandos, saídas,
hashes e a fronteira real/simulada de cada teste.

## L. Condições para autorização externa

Antes da rodada: operador revisa este preflight, os seis casos e a rubrica; confere
que a chave ativa pertence ao projeto gratuito com billing desativado; autoriza
explicitamente o novo roundId, manifesto, modelo e orçamento. Nenhuma autorização
histórica vale para esta rodada. A aprovação não é inferida de testes verdes.

Exemplo **somente para execução posterior autorizada; não executado nesta entrega**:

```sh
node scripts/uv.mjs run python -m app.evaluation.literary_executor --authorize-live \
  --round-id <UUID_NOVO_AUTORIZADO> \
  --approved-manifest-sha256 <HASH_DO_PREFLIGHT_REVISADO> \
  --key-fingerprint <FINGERPRINT_DA_CHAVE_ATIVA_CONFIRMADA> \
  --project-label projeto-gratuito-confirmado \
  --confirm-free-project --confirm-billing-disabled \
  --output-dir <DIRETORIO_NOVO_PRIVADO>
```

O preflight sem flags mostra hashes, modelo/fallback e fingerprint sem chave.
Por padrão a rodada para na primeira falha semântica; somente uma autorização
explícita para continuar casos independentes permite --continue-independent.
Paradas críticas continuam obrigatórias. Sobras não podem ser reaproveitadas.

## M. Decisão e próximos passos

**Infraestrutura aprovada nos testes offline executados, pronta para revisão e
nova autorização do operador. Rodada externa ainda não autorizada/executada.**
A formatação global permanece falhando nos 19 arquivos históricos; não se declara
que todos os checks do workspace estão verdes. A qualidade literária e a seleção
semântica real do Gemini não foram aprovadas.

Solicitar autorização expressa separada antes de qualquer chamada externa, com
até 12 requisições Gemini gemini-3.5-flash-lite, 6 PROPOSE/700 e 6 NARRATE/1.200,
teto configurado de 11.400 tokens de saída, sem retries, fallback, reparos ou
escrita em campanha/banco real. Reconfirmar projeto gratuito e billing desativado.
Depois das tentativas permitidas, encerrar e apresentar inclusive reprovações.
Não iniciar G3/G4/G5/G6, 5.7 ou 5.8.
