# KHAOS — Fase 5.6.1.1: precisão semântica de ações livres

01/11/2026, America/Sao_Paulo. **Correção implementada e validada offline;
confirmação semântica real pendente.** Zero chamadas externas Gemini/Groq.
Fase 5.6.3 permanece bloqueada. Nenhuma mecânica da 5.7 foi implementada.

## A. Diagnóstico das duas divergências

Foram lidos documento-base, vocabulário, ADRs 0005/0007/0010/0011, arquitetura
PROPOSE/NARRATE, contratos FreeAction, grafo/projeção, adaptador Gemini, política
NestJS, relatórios 5.6/5.6.1/5.6.2 e a [conclusão anterior](phase-5.6.1-completion.md).
O diagnóstico foi apresentado antes da implementação. O workspace já continha
alterações extensas; o diff contra HEAD não representa somente esta fase.

### Caso A — pergunta de memória marcada DIRECT

Mensagem: **“O que eu já descobri sobre essa porta?”**

O [recibo congelado](../ai/phase-5.6.1-case561-01-schema-confirmation.json)
contém QUERY, QUERY/MEMORY, a fonte KNOWN correta e `expression=DIRECT`.
Gabarito original: QUESTION. O replay inicial reproduziu `EXPRESSION`, com consulta
autorizada e sem efeitos. O valor errado já está no JSON bruto; não foi criado pelo
Pydantic, Zod ou pela política.

**Observado:** o prompt anterior já dizia QUESTION=consulta/pergunta e
DIRECT=tentativa atual, mas o contrato de geração não descrevia o campo. O modo da
mensagem é ACT e sua descrição operacional fala em consultar lembranças. Intenção,
ferramenta e expressão são dimensões diferentes; o backend aceita consultas DIRECT
porque comandos como “Consulte minhas lembranças” são legítimos. Rejeitar todo
QUERY/DIRECT mudaria essa semântica e não demonstraria compreensão da pergunta.

**Hipóteses apresentadas:** confusão entre operação e ato comunicativo; influência
do canal ACT/descrição operacional; transformação no adaptador. O recibo afasta a
última hipótese para esse caso. Não há evidência suficiente para atribuir uma causa
cognitiva exata ao Gemini ou provar que instruções melhores eliminarão o erro remoto.

**Tratamento:** instruções contrastivas no MASTER de produção e descrição de
expression espelhada no schema. QUESTION é pedido de informação, inclusive
indireto e sem interrogação; DIRECT é declaração/comando atual, inclusive comando
de consulta. Canal ACT, intent QUERY e descrição operacional não determinam
expression. Negação, citação e hipótese dependem do ato completo. Nenhum parser por
palavras-chave ou normalizador foi acrescentado.

O recibo errado continua DIRECT e reprovado. A correção não transforma um replay
da resposta histórica em um acerto. O teste de SDK protege a transmissão das novas
instruções; os testes roteirizados protegem os contratos e os caminhos seguros.
Eles não demonstram uma nova escolha semântica do Gemini.

### Caso B — tradição inferida em Escudo

Mensagem: **“Eu ergo meu Escudo.”**

O [recibo congelado do 561-06](../ai/phase-5.6.1-completion-live-result.json)
contém `arcanum=psychic-shield`, `raised=true` e `tradition=PSYCHIC`.
O replay inicial reproduziu `INVENTED_PARAMETER:tradition`, mas a política gerava
MECHANIC e retirava tradition ao construir o comando específico.

**Causa técnica comprovada:** ArcanaTool é um envelope genérico estrito quanto a
nomes/tipos, mas sem restrição cruzada de aplicabilidade entre arcanum e os cinco
parâmetros opcionais. Por isso tradition era estruturalmente válido. O comando
específico de Escudo contém somente arcanum, characterId e raised. A projeção
impedia levar a tradição ao motor, mas não recusava explicitamente a proposta.
Por que o modelo inferiu PSYCHIC continua hipótese; não houve chamada remota nesta fase.

**Tratamento:** antes de construir qualquer comando ARCANA executável, NestJS
confere os campos não nulos contra a aplicabilidade do arcano. Um campo incompatível
retorna CLARIFY com `ARCANA_PARAMETER_MISMATCH`, sem comando, rolagem ou consumo.
O motivo é persistido no campo existente `freeResolution.selectionReason`.
A resposta bruta não é reescrita para esconder o parâmetro.

| Arcano no recorte existente | Parâmetros de escolha admitidos no envelope FREE  |
| --------------------------- | ------------------------------------------------- |
| psychic-shield              | raised                                            |
| second-sight                | Nenhum dos cinco parâmetros opcionais             |
| psychic-contact             | tradition                                         |
| cure                        | Nenhum dos cinco; mantém o comando CURE existente |
| body-control                | tradition, use                                    |
| move-object                 | fatigue                                           |
| wind-shaping                | category                                          |

Omissão/null continuam significando ausência de escolha, conforme a compatibilidade
existente. Valores presentes `false` e `0` são escolhas e não escapam por teste de
truthiness. Escolhas necessárias omitidas continuam sujeitas aos esclarecimentos e
à adjudicação existentes. Tradições permitidas em Contato/Controle Corporal,
conhecimento, talento, alvo, consentimento, toque e custos continuam sob os
validadores anteriores e o motor. O guard também impede que a vinculação posterior
de contexto de Mover Objeto/Moldar Vento sobrescreva a recusa.

**Três origens distintas de valores:** raised/tradition/use/fatigue/category são
escolhas a interpretar da mensagem atual quando aplicáveis; characterId e o vínculo
com contexto canônico são derivados deterministicamente pelo servidor; custos e
resultados são oficiais do motor. Uma habilidade conhecida na ficha não constitui
declaração da jogadora. O LLM não deve completar uma escolha por plausibilidade.

Foram consultadas as páginas impressas brasileiras 99–102 do livro básico local,
correspondentes às páginas físicas 98–101, além dos comandos existentes em
`arcana.ts` e `schemas.py`. O Escudo não exige escolher uma tradição particular
para erguê-lo. Contato e Controle Corporal mantêm seus recortes anteriores.
A existência de usos mais amplos no livro não expande o comando CURE nem qualquer
outra mecânica nesta tarefa. A extração de consulta permaneceu em `/tmp`; PDFs e
fontes de aventuras não foram modificados ou redistribuídos.

## B. Arquivos modificados e justificativa

| Arquivo                                                                                              | Alteração desta fase                                                                                                                 |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/ai-service/app/narrative/prompts.py`                                                           | Somente MASTER/PROPOSE: distinção de campos, exemplos contrastivos e parâmetros dependentes do arcano; NARRATOR preservado           |
| `apps/ai-service/app/narrative/schemas.py`                                                           | Descrições de expression e dos cinco campos arcanos; sem mudança dos tipos, enums, campos obrigatórios ou validadores                |
| `packages/shared-contracts/src/free-action.ts`                                                       | Mesmas descrições no espelho Zod; transformações legadas de null preservadas                                                         |
| `apps/api/src/narrative/free-action.ts`                                                              | Matriz de aplicabilidade e recusa explícita anterior à construção do comando                                                         |
| `packages/shared-contracts/openapi/ai.json`                                                          | Reexportação local das descrições do schema FastAPI, sem iniciar servidor                                                            |
| `apps/ai-service/tests/test_phase5611.py`                                                            | Recibos preservados; 13 formas portuguesas no SDK simulado; instruções e schema enviados                                             |
| `apps/api/test/phase5611.spec.ts`                                                                    | Recusa do recibo, campos incompatíveis, false/zero, omissões, tradições contraditórias, opções legítimas e paridade entre linguagens |
| `apps/api/test/integration/phase56.spec.ts`                                                          | Cinco integrações novas com dados sintéticos e banco descartável                                                                     |
| `packages/shared-contracts/fixtures/phase5611-semantics.json`                                        | Fixtures adicionais; nenhum gabarito congelado anterior foi alterado                                                                 |
| `packages/shared-contracts/test/phase5611.test.cjs`                                                  | Metadados do contrato, compatibilidade e preservação explícita de valores                                                            |
| `docs/ai/free-action-interpreter.md`, `docs/ai/tool-selection.md`, `docs/testing/narrative-tests.md` | Política, limites e índice TEST-SEM5611                                                                                              |
| Este relatório e os dois JSONs de evidência vinculados abaixo                                        | Diagnóstico, execução, hashes, replay offline e proposta de confirmação futura                                                       |

Impacto confirmado: rota interna → grafo PROPOSE → schema/adaptador → Zod →
interpretFreeAction → resolução existente → motor. Somente os quatro arquivos
de produção acima receberam alterações, além do artefato de schema. Não mudaram
endpoints, tabelas, migrations, chaves de idempotência, resolução transacional,
regras Blue Rose ou estado de campanhas. Os nove arquivos preexistentes alterados
coincidem com esse escopo e os documentos/testes descritos; os outros 357 arquivos
da baseline permanecem idênticos por hash.

Para atualização, instalar contratos/API com o guard antes do Python com as novas
instruções. Um produtor antigo continua estruturalmente compatível, mas parâmetros
irrelevantes agora recebem esclarecimento. Não há migração de histórico. Para
recuperação, preservar banco/recibos e a fronteira 5.6.2; retomar somente o estágio
pendente, sem repetir efeitos já confirmados. Reverter apenas as instruções Python
mantém o guard da API. Não foi realizado deploy nem inventado comando de rollback.

## C. Testes antes/depois

Os recibos reais foram reproduzidos antes da correção, sem SDK remoto, usando
`grade` e `scripts/replay-selection.mjs` sobre os JSONs originais. Foram mantidas
as duas reprovações semânticas e a consulta correta. O recibo do Escudo passou de
MECHANIC no replay inicial a CLARIFY no replay da política corrigida.

| Recorte novo                                | Antes da correção                                                           | Depois, incluído na suíte final            |
| ------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------ |
| Python 5.6.1.1                              | 14 falharam, 1 passou: descrições/instruções ausentes no wire               | 15 passaram                                |
| Unidade NestJS 5.6.1.1                      | 31 falharam, 17 passaram: parâmetro incompatível não recusado               | 48 passaram                                |
| Contratos novos, execução direta            | 1 falhou, 1 passou: metadados ausentes                                      | 2 passaram                                 |
| Integração inicial direcionada, dois testes | 1 falhou, 1 passou: MECHANIC em vez de CLARIFY no Escudo com tradição extra | Cinco testes novos passaram na suíte final |

A construção da fixture exigiu corrigir a tipagem do teste, usar o talento existente
no catálogo e ler a auditoria no campo correto. Na primeira suíte completa, três
expectativas novas procuravam `reason`, enquanto o contrato persistido já usa
`selectionReason`: 433 passaram e essas três falharam. As expectativas foram
corrigidas sem nova alteração de produção; a execução completa posterior passou.
Essas falhas de elaboração de teste não são tratadas como defeitos corrigidos no motor.

| Verificação final                                                                                         | Resultado                                | Cobertura                                                         |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| NestJS completo: 30 suítes, unidades/contratos/integração PostgreSQL                                      | **436 passaram, zero falhas**, 106,774 s | 93,83% linhas; 92,39% statements; 84,25% branches; 96,48% funções |
| Política free-action                                                                                      | Exercitada na suíte completa             | 95,38% linhas; 92,40% branches; 100% funções                      |
| Renderer 5.6.2                                                                                            | Regressões existentes passaram           | 98,76% linhas; 95,95% branches                                    |
| Python completo                                                                                           | **344 passaram, zero falhas**, 10,18 s   | 87% global; grafo 96%; schema 99%                                 |
| Contratos compartilhados                                                                                  | **13 passaram, zero falhas**             | Inclui os dois testes novos                                       |
| Builds/API e contratos, typechecks/API e contratos, mypy, Ruff, ESLint e formatação dos arquivos afetados | Passaram                                 | Sem check global de arquivos preexistentes fora do escopo         |

Não há teste existente desativado ou expectativa de segurança relaxada. O recorte
vermelho de integração usa `-t TEST-SEM5611`; a suíte final executa todos os testes.

### Reprodução a partir da raiz

```sh
.tools/node_modules/.bin/pnpm --filter @solo-rpg/shared-contracts build
.tools/node_modules/.bin/pnpm --filter @solo-rpg/api build
node scripts/uv.mjs run pytest tests/test_phase5611.py -q
.tools/node_modules/.bin/pnpm --filter @solo-rpg/api exec jest --runInBand test/phase5611.spec.ts
node packages/shared-contracts/test/phase5611.test.cjs
PATH="$PWD/.tools/node_modules/.bin:$PATH" node scripts/test-integration.mjs --coverage
node scripts/uv.mjs run pytest --cov=app --cov-report=term-missing
.tools/node_modules/.bin/pnpm --filter @solo-rpg/shared-contracts test
.tools/node_modules/.bin/pnpm --filter @solo-rpg/api typecheck
.tools/node_modules/.bin/pnpm --filter @solo-rpg/shared-contracts typecheck
node scripts/uv.mjs run mypy app
node scripts/uv.mjs run ruff check app/narrative/schemas.py app/narrative/prompts.py tests/test_phase5611.py
node_modules/.bin/eslint apps/api/src/narrative/free-action.ts apps/api/test/phase5611.spec.ts apps/api/test/integration/phase56.spec.ts packages/shared-contracts/src/free-action.ts
```

As suítes com event loop, subprocessos e portas locais foram executadas fora do
sandbox com autorização operacional, pelos bloqueios de ambiente já reproduzidos
na etapa anterior. Os provedores continuam simulados. O runner Node usa somente
PostgreSQL descartável com marcador `solorpg-test-*` e banco `/solorpg_test`,
removendo apenas os próprios recursos. Fixtures existentes que carregam uma
aventura o fazem somente nesse banco descartável; não houve reimportação de
campanha real nem alteração de definição/digest de aventura.

## D. Compatibilidade Pydantic/Zod/NestJS

O formato do envelope não mudou: FreeAction legado admite expression/evidence
opcionais, SelectedFreeAction exige ambos, e ARCANA conserva os cinco campos.
As descrições são idênticas em Pydantic/Zod, verificadas no JSON serializado.
A conversão const→enum na geração permanece intacta. O teste usa o SDK oficial
instalado com `httpx.MockTransport`; conexões de socket externas são bloqueadas
nos testes novos Python. Uma chamada simulada não é uma chamada Gemini real.

A matriz anterior de 101 propostas e oito fixtures congeladas continua passando
em ambos os sentidos entre linguagens. Os testes anteriores de discriminadores,
campos extras, comandos administrativos e envelope histórico inválido permanecem.
Os testes novos transportam parâmetros legítimos dos sete arcanos, preservam valores
e conferem a rejeição específica da política.

**Estrutura válida não significa ação autorizada:** o JSON histórico com
tradition=PSYCHIC no Escudo ainda passa estruturalmente em Pydantic/Zod. O campo
continua visível para auditoria, mas a API recusa a proposta inteira antes do
comando. Essa separação preserva leitura de propostas antigas sem tornar o schema
genérico uma autorização mecânica. Null não é tratado como escolha; nenhum valor
não nulo incompatível é removido para executar o restante.

Os testes de português incluem perguntas diretas e indiretas, declaração, comando,
negação, citação, hipótese e pergunta sem ponto de interrogação. São saídas
roteirizadas: validam transmissão/contrato e segurança da resolução. A integração
de memória primeiro confirma uma descoberta por teste oficial; depois responde a
QUERY/MEMORY/QUESTION com o KNOWN persistido e verifica que o número de rolagens
permanece um, sem novos eventos ou investigação.

[Replay offline dos recibos e candidatos roteirizados](../ai/phase-5.6.1.1-offline-replay.json).

## E. Garantias de preservação da 5.6.2

`rendering.ts`, `context.service.ts`, `narrative.service.ts`, grafo e código de
resolução transacional permanecem idênticos à baseline. O NARRATOR continua
selecionando fragmentos completos. Catálogo, comparação integral, resultado oficial,
memória atribuída e publicação de `validation.narration` não foram alterados.

As regressões TEST-CANON-001–012 passaram na suíte completa, incluindo a frase
original da galeria atrás da estante, paráfrases, fracasso, descoberta legítima,
sigilo, HTTP/SSE/histórico, recuperação e idempotência. A proteção não foi
substituída por heurística, regex adicional ou confiança em prompt.

Hashes preservados: `.env`, `.env.example`, modelo/provedores/router, plano
congelado, recibos/revisões históricos, PDFs, regras, definições/digests de aventuras
e demais arquivos fora do escopo. A confirmação financeira permanente continua
false, fallback false e o modelo configurado inalterado. Nenhuma chave foi emitida,
modificada ou incorporada a evidências. Zero escrita em banco/campanha real.

## F. Limitações e pendências

- **Caso A:** a melhoria de instruções está no código e no wire, mas sua eficácia
  no Gemini não foi medida. Uma resposta histórica DIRECT continua errada; não há
  garantia determinística de classificação do português a partir de testes com mocks.
- **Caso B:** a incompatibilidade estrutural entre arcano e parâmetro é recusada
  deterministicamente. Ainda é responsabilidade semântica do LLM distinguir uma
  escolha realmente declarada de uma escolha inferida que seja aplicável ao arcano.
  Não foi criado um extrator universal de evidências textuais ou parser por palavras.
- A tabela descreve o contrato implementado, não toda a edição Blue Rose. Regras
  de tradição, consentimento, custos, alvo e resultados não foram ampliadas.
- A aplicabilidade deve acompanhar futuros arcanos/comandos. O mapa tipado exige
  entrada para cada arcanum do contrato; fixtures e descrições devem ser atualizadas
  juntas quando houver uma tarefa autorizada para ampliar esse conjunto.
- Exemplos contrastivos no prompt são instruções de produção, não evidência de
  generalização. Uma confirmação dos casos originais será uma amostra dirigida;
  outros contrastes exigirão avaliação e orçamento próprios.
- Consulta/observação continuam fundamentadas em fontes autorizadas. Qualidade
  literária, variedade, exploração irrestrita, autonomia completa e campanha inteira
  sem operador não foram avaliadas. 5.6.3 e 5.7 não foram iniciadas.

[Resumo estruturado, resultados e hashes](../ai/phase-5.6.1.1-validation-summary.json).

## G. Plano de reavaliação real proposto — não executado

Após autorização separada, propor **duas tentativas PROPOSE**, uma para 561-01 e
uma para 561-06, com mensagens/contextos/gabaritos originais, modelo configurado
`gemini-3.5-flash-lite`, teto de 700 tokens por tentativa. Sem NARRATE, retries,
reparos, fallback, troca de modelo ou escrita em campanha/banco real. Conferir a
chave ativa e a atestação financeira nessa autorização; qualquer confirmação
temporária valerá somente para o processo autorizado.

Antes disso, revalidar os hashes, os testes relevantes e as configurações. Usar o
fluxo e o prompt de produção, sem prompt especial de avaliação e sem enviar o
objeto de gabarito. Preservar JSON bruto, modelo reportado, consumo e latência;
avaliar semântica, contrato e autorização independentemente.

- **561-01:** exigir QUERY/QUERY MEMORY/QUESTION e KNOWN exato, sem novo teste.
- **561-06:** exigir ARCANA/psychic-shield/raised=true, sem valor adicional proibido.
  CLARIFY seguro causado por parâmetro inventado continua sendo erro semântico,
  não aprovação do Gemini. Null/omissão mantêm a rubrica original.
- Interromper diante de 429, autenticação/finanças, schema crítico, modelo inesperado,
  capacidade administrativa, sigilo crítico ou risco de alterar estado real.
- Não alterar gabaritos, reclassificar recibos anteriores ou atribuir acerto a fallback.

**Nenhuma chamada dessa proposta foi executada ou agendada.** Esta entrega permite
solicitar a confirmação real separada; a Fase 5.6.3 permanece bloqueada até decisão
posterior baseada nessa confirmação.
