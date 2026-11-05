# Testes da integração narrativa

Executar a partir da raiz:

```bash
pnpm python:sync
pnpm --filter @solo-rpg/shared-contracts build
pnpm test:integration
pnpm --filter @solo-rpg/api test:coverage
pnpm --filter @solo-rpg/ai-service test
pnpm typecheck
pnpm lint
```

`scripts/test-integration.mjs` cria um PostgreSQL descartável, aplica migrations e
remove somente seu container/volume exclusivo. Não aponta para a campanha real.
`test/integration/narrative.spec.ts` cobre oficialização, retomada, rolagens, falhas,
continuidade entre sessões, efeitos dependentes, conhecimento e combate.

Contratos rejeitam patches arbitrários e comandos no narrador. Python verifica os
quatro modos, grafo, autenticação interna e provedores simulados, incluindo limites,
timeout, conexão e fallback restrito. O gateway TypeScript é testado com fetch
simulado, autenticando chamadas e limitando a resposta antes de fazer parse JSON.

Os testes do motor das Fases 1–3 continuam na suíte completa. Não é necessário usar
chaves externas para testes automatizados. Dados determinísticos nos testes não
substituem o RNG criptográfico da aplicação.

Cobertura e resultados efetivamente executados devem ser conferidos na entrega e
na saída dos comandos. A avaliação de APIs reais depende de chave gratuita válida e
configuração explícita; sem isso, não alegar consumo ou qualidade observados.

## Registro da Fase 5.3

Os TEST-IDs `TEST-AI53-001` a `TEST-AI53-009`, fronteiras reais/simuladas, resultados
e lacunas estão no [registro de validação](phase-5.3-validation.md#registro-de-evidências-por-requisito).
Essa matriz inclui provedores, memória individual, Director, duas sessões,
ferramentas, contrato serializado, interpretação simulada e a avaliação real pendente.
`test_live_validation.py` usa mocks: executar pytest não autoriza ou dispara APIs reais.

## Fase 5.5

[Validação e matriz TEST-55-001 a TEST-55-022](phase-5.5-validation.md) cobrem progressão por objetivos, transações, contexto público e menções. Provedores simulados não certificam a semântica do Gemini nem resolvem as pendências reais de 5.4.

## Fase 5.6

[Validação TEST-AI56-001–006](phase-5.6-validation.md): 101 cenários compartilhados,
40 contrastes de contexto, grafo Python com propostas roteirizadas, validação
NestJS, motor/PostgreSQL reais, fontes, menções e regressões 5.4/5.5.
Acurácia semântica real é uma medição separada, pendente de nova autorização.

## Fase 5.6.2

[Matriz TEST-CANON-001 a TEST-CANON-012](phase-5.6.2-validation.md): publicação por
fragmentos, paráfrases, atmosfera legítima, diálogo e rumores, contrato entre
runtimes, fallback, recuperação e HTTP/SSE/histórico/banco descartável. A regressão
original da galeria mantém a expectativa de publicar somente o fracasso oficial.

## Fase 5.6.1.1

`TEST-SEM5611` liga as divergências reais 561-01/561-06 à
[validação de precisão semântica offline](phase-5.6.1.1-validation.md).
`test_phase5611.py` captura prompt/schema no SDK com transporte HTTP em memória e
preserva os erros dos recibos. `phase5611.spec.ts` cobre consultas em português,
campos arcanos incompatíveis, omissões, escolhas legítimas e paridade Pydantic/Zod.
`phase5611.test.cjs` protege o contrato compartilhado. As integrações acrescentadas
a `phase56.spec.ts` cobrem consulta KNOWN sem nova rolagem, recusa auditada, Escudo
idempotente e proibição de sobrescrever a recusa por contexto arcano preparado.
Nenhum desses testes mede acurácia Gemini real ou autoriza a Fase 5.6.3.

## Fase 5.6.3A — laboratório narrativo offline

`TEST-LIT563A` está ligado ao pedido de diagnóstico multiturmo e ao
[relatório 5.6.3A](phase-5.6.3a-validation.md). Integração/especialized protection:
`test/integration/phase563a-lab.spec.ts` executa os seis cenários 563A-01–06 com
dois seletores roteirizados, HTTP, grafo Python, motor e PostgreSQL descartável.
Verifica transcritos publicados, estado, sigilo, memória individual, agência e a
galeria rejeitada. Não usa Gemini/Groq nem testa UI ou qualidade de seleção neural.

Unidade/regression protection: `tests/test_narrative_lab.py` protege contagem de
repetição no texto publicado, completude das sequências, gate eliminatório e CLI
que recusa sobrescrever evidência. Os critérios e notas editoriais são explícitos
e separados de medidas automáticas; não há nota automática do Gemini.

Comando especializado e fronteiras/limitações estão no relatório. As regressões
existentes de canonicidade e progressão foram reexecutadas; nenhum teste anterior
foi removido ou enfraquecido. Avaliação literária real permanece `unverified`.

## Fase 5.6.3B — vozes e réplicas contextuais

[Validação G1/G2 e matriz TEST-VOICE-001–015](phase-5.6.3b-validation.md).
`dialogue-content.spec.ts` protege autorização por identidade, estado, fontes,
modalidade, digest, versão e composição; inclui paridade Pydantic/Zod.
`integration/phase563b-lab.spec.ts` executa os mesmos 58 turnos e controles
adicionais de duas vozes, promessa HEARD, sigilo, invalidação transacional,
fallback, DTO e idempotência em PostgreSQL descartável.

`test_contextual_dialogue.py` testa projeção de mínimo privilégio, wire legado,
schema do SDK com transporte em memória e beats integrais.
`test_dialogue_comparison.py` impede comparar inputs modificados ou declarar
reprodução histórica quando o texto publicado diverge. Contratos compartilhados
possuem testes próprios em `test/dialogue.test.cjs`. Os transcritos, métricas e
revisão editorial do agente são evidências offline; não certificam Gemini.

## Fase 5.6.3B.0 — estabilização e plano de Story Cards

[Validação consolidada e auditoria](phase-5.6.3b-0-validation.md): uma execução
completa NestJS com 485/485 e 33 suítes; a comparação ordenada do
`TEST-55-017/018/019/020` mantém todos os registros/campos HEARD. Python e
contratos foram reexecutados. Não houve mudança de produção nem de expectativas.

`TEST-SCARD-001–020` indexa a matriz futura na seção F do relatório: todos estão
**unverified para o adaptador G1/G2**. Níveis previstos: unit, contract e
integration; propósitos: rule protection, critical path e regression protection.
A fixture `test/fixtures/story-card-dialogue-plan.json` é sintética e apenas de
planejamento; seu bloco de definição foi validado com o schema existente, sem
importação. Não foi incluído teste falho/skip na suíte atual. Esses pontos só
podem mudar para covered após implementação e execução da futura integração.

## Fase 5.6.3B.1 — adaptador opt-in de Story Cards

`TEST-SCARD-001–020` passam a ter evidência executável na
[matriz B.1](phase-5.6.3b-1-validation.md#g-matriz-test-scard-001020).
Unidade/contract: `test/story-card-dialogue.spec.ts` e
`shared-contracts/test/story-card-dialogue.test.cjs` protegem escopo, identidade,
digest após JSONB, versões, arquétipos, fontes e ausência de autoridade FREE.
Integração/critical path, rule protection e regression protection:
`test/integration/story-card-dialogue.spec.ts` usa HTTP NestJS, FastAPI/grafo real
com provedor roteirizado e PostgreSQL descartável. Verifica publicação e memória
reais, homônimos, fontes exclusivas, revogação, rollback/retry, duas sessões e
galeria. `test_story_dialogue_bridge.py` verifica a projeção efetiva do grafo.

A B.0 permanece como registro histórico do planejamento. Cobertura de
TEST-SCARD-017 significa **recusar** participação/WITNESSED não comprovados;
essa capacidade positiva não foi implementada. Acurácia/literatura Gemini
permanecem unverified. Resultado consolidado e a pendência de formatação histórica
estão no relatório B.1; não são convertidos em aprovação global de todos os checks.

## Fase 5.6.3C.0 — preparação e diagnóstico literário offline

[Validação A–L e critérios](phase-5.6.3c-0-validation.md),
[protocolo/rubrica](../ai/phase-5.6.3c-literary-evaluation.md) e
[plano C.1 não autorizado](../ai/phase-5.6.3c-1-live-plan.json).

| TEST-ID / estado                        | Responsabilidade e evidência                                                                                                                                                                                         | Nível / propósito / fronteira                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| TEST-LITC0-001 — covered                | `test/literary-evaluation.spec.ts`: NAR-01–12, 50 pedidos, dois seletores, catálogos e saída autorizada; `tests/test_literary_preparation.py`: métricas, completude, origens e 12 requests futuros no grafo simulado | unit, contract; specialized protection; helpers reais em memória, sem DB/modelo real      |
| TEST-LITC0-002 — covered                | Controle de speech/motivação/personality dentro do perfil e diagnóstico de vozes, sem confundir distância lexical com nota humana                                                                                    | unit; specialized protection; comparação determinística                                   |
| TEST-LITC0-003 — covered                | Seleção genérica apesar de réplica disponível; distinção entre lacuna, recusa de publicação e pertinência pendente                                                                                                   | unit; regression protection; política real, escolha roteirizada                           |
| TEST-LITC0-004 — covered                | HEARD sem participação não habilita desacordo pessoal; referência própria e matriz congelada. Integração B.1 reexecutada protege loader e memória persistida                                                         | unit, integration; rule protection; PostgreSQL descartável e grafo simulado na integração |
| TEST-LITC0-005 — covered                | Galeria original recusada, RESULT preservado; avaliador exclui draft das métricas. Regressões 5.6.2/canonicidade reexecutadas                                                                                        | unit, integration; regression protection; publicação e persistência reais com IA simulada |
| Qualidade/seleção real C.1 — unverified | Rubrica humana sem notas, plano sem executor externo; exige nova autorização e revisão                                                                                                                               | specialized protection; nenhuma requisição real nesta fase                                |

Comandos especializados, saídas e limites estão no relatório. Execução dirigida
final: 103 testes NestJS em seis suítes, 39 Python e 15 contratos. Nenhuma suíte
global nova ou teste web foi alegado. Arquivos novos entram nos runners Jest/pytest
existentes; o analisador CLI é offline e recusa sobrescrever evidência. Formatação
histórica dos 19 JSONs permanece pendência separada. Produção e contratos não mudaram.

## Fase 5.6.3C.1 — preflight do executor real, sem chamadas externas

[Relatório A–M](phase-5.6.3c-1-preflight-validation.md) indexa TEST-C1-001–016.
Estado **covered offline** para infraestrutura; qualidade/seleção Gemini real
continuam **unverified**, sujeitas a nova autorização. O plano C.0 não foi alterado.

`tests/test_literary_executor.py` cobre orçamento global, slots, captura SDK antes
do parsing, schema original, modelo reportado, 429/autenticação/financeiro,
segregação de gabaritos, identidade/memória, replay NestJS, sigilo, exclusividade,
pertinência pendente e métricas somente da saída autorizada. Níveis: unit,
integration, contract; propósitos: specialized protection, regression protection.
Fronteira: SDK/grafo/router reais com HTTP em memória e replay Node somente leitura,
sem banco/campanha ou provedor real. Os 40 testes novos fazem parte do pytest padrão.

O replay usa `scripts/evaluate-literary-case.mjs` com os contratos/políticas de
produção compilados. As 103 regressões NestJS dirigidas incluem HTTP/grafo com
provedor simulado e PostgreSQL descartável, preservando publicação, galeria,
Story Cards e memória. Rodada Python dirigida final: 171 testes; contratos: 15.
Não é uma nova execução consolidada global. Comandos, limites, falhas intermediárias,
cobertura e hashes estão no relatório/recibos. Nenhum teste concede autorização live.
