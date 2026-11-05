# KHAOS — Fase 5.6.1: avaliação semântica real

01/11/2026. **BLOQUEADA após uma tentativa real por erro de schema.** Zero casos
aprovados integralmente, um reprovado operacionalmente, sete não executados.
Os campos semânticos da resposta bruta do primeiro caso estão corretos; o envelope
inválido impediu sua continuidade no fluxo. Nenhuma nova chamada foi feita após a falha.

Correção posterior: a [conversão de constantes no schema de geração foi corrigida e
validada offline](phase-5.6.1-schema-fix.md). Isso não altera os resultados reais
abaixo; a confirmação remota do 561-01 continua pendente de autorização.

## Autorização e identificação da chave

O operador autorizou até oito tentativas Gemini, modelo `gemini-3.5-flash-lite`,
700 tokens de saída por tentativa, sem retries, fallback, troca de modelo/provedor,
alteração de faturamento ou alteração permanente de `.env`. Consumo inicial: zero.
Após a inspeção da `.env`, confirmou especificamente nesta conversa:
**“Confirmo essa chave e faturamento desativado”**, em resposta à pergunta sobre a
chave atualmente salva nesse arquivo pertencer ao projeto gratuito verificado.

A `.env` contém a chave, mas não um ID/número do projeto ou metadados de billing.
A identificação financeira é, portanto, atestação expressa do operador sobre a
chave ativa, não verificação independente via Google Cloud. Não havia sessão Google
conectada ou CLI gcloud disponível. Nenhuma credencial entra nos artefatos.

Configuração efetiva conferida: Gemini, `gemini-3.5-flash-lite`, fallback false,
confirmação gratuita false por padrão; chave presente e sem override no ambiente.
A flag será true exclusivamente no processo autorizado.

## Investigação e procedimento

Foram lidos o relatório e o plano 5.6, o avaliador `selection.py`, a ponte
`replay.py`, o replay de integração NestJS, os contratos TypeScript/Pydantic,
o grafo, a projeção de contexto, o prompt, o roteador e o adaptador Gemini.
Também foram conferidos os recibos 5.4 de investigação, arcano, ambiguidade e OOC.

O grafo de produção escolhe `SelectedFreeAction` quando há contexto `selection`;
esse é o mesmo schema enviado pelo adaptador ao SDK. O contrato FREE legado mantém
campos opcionais de compatibilidade; a geração nova exige expressão e evidências.
PROPOSE fixa 700 tokens. O roteador verifica confirmação gratuita, limite de
requisições e allowlist antes de criar/chamar o adaptador; o SDK usa attempts=1.

O plano 5.6 não contém as oito mensagens solicitadas nesta etapa. Por isso, a
orquestração `app.evaluation.phase561` usa as mensagens exatas do novo
[plano congelado](../ai/phase-5.6.1-plan.json), com o mesmo grafo, projeção, prompt,
roteador e adaptador de produção, sem alterar nenhum desses arquivos. Gabaritos e
propostas roteirizadas pertencem exclusivamente ao avaliador. Somente `request`
entra no grafo. O observador registra a resposta bruta do SDK e a versão do modelo
sem mudar parâmetros ou o retorno do adaptador. O arquivo de saída é criado de
forma exclusiva para impedir repetição acidental do lote no mesmo caminho.

Cada chamada reserva uma tentativa antes de executar. Erros do provedor, schema e
mudanças de modelo interrompem o lote. A política conservadora da 5.6 de interromper
em ferramenta mecânica inesperada também foi preservada. Não existe reparo de
schema nem reexecução de caso. O CLARIFY de recuperação do grafo é registrado como
fallback e nunca como seleção correta do modelo.

O script `scripts/replay-selection.mjs` importa as funções compiladas de produção
`freeActionSchema`, `interpretFreeAction` e `validateRendering`; não inicia a
aplicação, não acessa banco, não chama o motor nem executa efeitos. Registra proposta,
resolução, motivo e resultado informativo. Essa validação de autorização não é
comprovação das regras completas de Blue Rose. Fontes de Escudo foram resumidas
do livro local, p.102; a política pública de sessões vem da arquitetura existente.

Comandos existentes de build foram executados antes do replay:

```sh
.tools/node_modules/.bin/pnpm --filter @solo-rpg/shared-contracts build
.tools/node_modules/.bin/pnpm --filter @solo-rpg/api build
node scripts/uv.mjs run pytest tests/test_phase561.py tests/test_phase56.py -q
.tools/node_modules/.bin/pnpm --filter @solo-rpg/api exec jest --runInBand test/phase56.spec.ts
```

Resultado prévio: oito cenários roteirizados atravessaram o grafo e o validador local;
129 testes Python e 107 testes NestJS passaram. Isso não mede acurácia Gemini.
O sandbox bloqueou o despertar do event loop a partir do segundo turno; a execução
offline fora do sandbox passou. Nenhuma chamada externa foi feita nessa investigação.

Interface do novo orquestrador inspecionada por `--help`; execução real autorizada:

```sh
AI_FREE_TIER_CONFIRMED=true node scripts/uv.mjs run python -m app.evaluation.phase561 --authorize-live --operator-key-confirmed --max-requests 8 --output /home/barreto/Desktop/projetos/soloRPG/docs/ai/phase-5.6.1-live-result.json
```

Não repetir esse comando após erro nem escolher outro arquivo para contornar a
proteção. A autorização cobre somente este lote. Verificações por SHA-256 conservam
o estado de `.env`, prompts, contratos e políticas antes/depois. Nenhuma Fase 5.7
foi iniciada e nenhum documento de regras ou PDF foi alterado.

## Resultados reais

[Recibo bruto e métricas do SDK](../ai/phase-5.6.1-live-result.json),
[revisão separada de seleção/schema/autorização](../ai/phase-5.6.1-review.json),
[plano, contextos e expectativas](../ai/phase-5.6.1-plan.json) e
[replay roteirizado offline](../ai/phase-5.6.1-offline-result.json).
O replay roteirizado não deve ser somado às tentativas nem aos acertos reais.

| Caso                                    | Esperado                                          | Gemini                                                         | NestJS                                       | Resultado                                                               |
| --------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| 561-01: conhecimento anterior           | QUERY / QUERY-MEMORY, fonte KNOWN                 | QUERY / QUERY-MEMORY, fonte KNOWN exata; `kind=QUERY` inválido | Zod recusou antes da política de autorização | Reprovado operacionalmente; seleção semântica correta na resposta bruta |
| 561-02: observação simples              | OBSERVE / OBSERVE, fonte PUBLIC                   | Não chamado                                                    | Não avaliado com resposta real               | Não executado após parada obrigatória                                   |
| 561-03: investigação preparada          | INVESTIGATE / PREPARED_CHECK, capacidade da Porta | Não chamado                                                    | Não avaliado com resposta real               | Não executado após parada obrigatória                                   |
| 561-04: investigação sem política       | INVESTIGATE / ADJUDICATE ou CLARIFY               | Não chamado                                                    | Não avaliado com resposta real               | Não executado após parada obrigatória                                   |
| 561-05: consulta Escudo                 | QUERY ou OOC / QUERY-RULES, fonte oficial         | Não chamado                                                    | Não avaliado com resposta real               | Não executado após parada obrigatória                                   |
| 561-06: erguer Escudo                   | ARCANA / psychic-shield, raised=true              | Não chamado                                                    | Não avaliado com resposta real               | Não executado após parada obrigatória                                   |
| 561-07: magia ambígua                   | ARCANA / CLARIFY, sem escolher arcano/alvo        | Não chamado                                                    | Não avaliado com resposta real               | Não executado após parada obrigatória                                   |
| 561-08: encerramento e reviravoltas OOC | OOC ou QUERY / QUERY-RULES, política pública      | Não chamado                                                    | Não avaliado com resposta real               | Não executado após parada obrigatória                                   |

### Caso 561-01: três dimensões independentes

Mensagem original: **“O que eu já descobri sobre essa porta?”**. A protagonista
possui uma descoberta anterior confirmada sobre a fechadura; essa fonte aparece
como KNOWN, separada da descrição perceptível PUBLIC. A saída efetivamente recebida:

```json
{
  "kind": "QUERY",
  "intent": "QUERY",
  "description": "Consultar a memória sobre as descobertas anteriores a respeito da porta.",
  "target": { "type": "WORLD", "name": "Porta" },
  "expression": "QUESTION",
  "evidence": ["info-b8009dbd5409f0d34e434465"],
  "tool": { "type": "QUERY", "subject": "MEMORY" }
}
```

Fonte selecionada: **“Uma investigação anterior confirmou que a fechadura da Porta
está danificada.”** O contexto sintético e o gabarito estão no plano; o identificador
é um hash público de fonte, não credencial.

- **Semântica:** correta para intenção, ferramenta, assunto, expressão, alvo e fonte.
  Não selecionou investigação, rolagem, nova descoberta ou efeito. A revisão dos
  campos brutos não corrige nem reapresenta a proposta ao motor.
- **Operacional:** reprovada. `SelectedFreeAction.kind` exige o literal `FREE`;
  recebeu `QUERY`. Pydantic registrou `kind:literal_error`. Os demais campos não
  apresentaram erro nessa validação. JSON sintaticamente válido não é resposta
  contratualmente válida.
- **Autorização/segurança:** a resposta bruta foi entregue ao replay NestJS e Zod
  recusou o envelope. `interpretFreeAction` não foi alcançado. A recusa de contrato
  foi correta; não há autorização substantiva de QUERY a registrar. O CLARIFY que
  o grafo retornou é recuperação local, não resposta selecionada pelo Gemini.

O orçamento foi encerrado no primeiro `INVALID_RESPONSE`, conforme a interrupção
obrigatória por schema. Não houve retry, reparo, NARRATE real ou aproveitamento de
tentativas remanescentes. O modelo reportado na resposta foi exatamente
`gemini-3.5-flash-lite`.

## Métricas

| Métrica                                                            | Resultado real                 |
| ------------------------------------------------------------------ | ------------------------------ |
| Tentativas                                                         | 1 / máximo 8                   |
| Respostas válidas pelo schema                                      | 0                              |
| Seleções semânticas corretas nos campos brutos                     | 1                              |
| Seleções semânticas incorretas observadas                          | 0                              |
| Falhas de schema                                                   | 1                              |
| Propostas semanticamente indevidas bloqueadas                      | 0 observadas                   |
| Contratos inválidos bloqueados                                     | 1                              |
| Erros de fundamentação observados                                  | 0; sete cenários sem evidência |
| Casos aprovados integralmente                                      | 0                              |
| Casos reprovados                                                   | 1 operacional                  |
| Casos não executados                                               | 7                              |
| Tokens de entrada reportados                                       | 2.095                          |
| Tokens de saída reportados                                         | 137 / limite 700               |
| Tokens totais reportados                                           | 2.232                          |
| Tentativas com consumo desconhecido                                | 0                              |
| Latência 561-01                                                    | 1.672 ms                       |
| Latência 561-02 a 561-08                                           | Não aplicável: não chamados    |
| Requisições literárias adicionais / retries / fallback de provedor | 0 / 0 / 0                      |

O CLARIFY local não consome chamada e não entra como acerto. A contagem de seleções
corretas mede somente os campos semânticos legíveis da saída bruta; não equivale a
uma resposta operacional válida nem a aprovação de um caso. As sete não execuções
não são classificadas como acertos ou erros semânticos. Não houve 429, erro de
autenticação, sinalização de faturamento ou mudança de modelo nesta tentativa.

## Causa, responsabilidades e correção proposta

**Causa observada:** o valor do envelope foi confundido com a intenção/ferramenta.
A ação desejada é uma consulta e foi selecionada assim, mas `kind` recebeu `QUERY`
em vez de `FREE`. Isso não é uma seleção de investigação bloqueada pelo backend.

**Modelo/integração:** há uma violação do literal solicitado na saída real.
**Contexto:** forneceu o conhecimento anterior e a fonte foi usada corretamente;
não há evidência de deficiência contextual nesse caso. **Contrato:** exige FREE
de forma coerente em Python e TypeScript. **Validação:** ambas recusaram corretamente.

**Hipótese técnica a investigar, não causa remota comprovada:** Pydantic emite
`kind: {"const":"FREE","type":"string"}`; o adaptador envia esse dicionário
em `response_json_schema`. O SDK instalado é google-genai 1.75.0 e conserva esse
campo como `responseJsonSchema`. A [documentação oficial de saída estruturada](https://ai.google.dev/gemini-api/docs/structured-output)
descreve um subconjunto JSON Schema e enumera `enum` para valores limitados de
strings; isso não comprova isoladamente que `const` causou a falha observada.

Correção candidata para uma etapa posterior: representar literais constantes como
enum de um único valor **apenas no schema de geração enviado ao provedor**, mantendo
o contrato e a validação local estritos. Verificar offline a equivalência e os
demais discriminadores. Não normalizar a resposta recebida para esconder a falha.
Nenhum prompt, contrato, adaptador ou política foi corrigido durante este lote.
Foi acrescentada apenas regressão offline usando o recibo real: seleção dos campos
correta, Pydantic recusa exclusivamente kind e Zod também recusa.

Verificação final: **130 testes Python e 107 testes NestJS passaram**. Após ajustes
de tipagem apenas no novo orquestrador, seus 12 testes direcionados passaram
novamente; mypy, Ruff e ESLint do novo script também passaram. Nenhuma chamada
real foi repetida durante essas verificações. A inspeção dos oito novos arquivos
não encontrou nenhuma das credenciais configuradas.

## Comparação com a Fase 5.4

| Evidência anterior                                        | Resultado 5.6.1                                   | Conclusão permitida                                                                             |
| --------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| INVESTIGATE escolheu QUERY/LOCATION apesar de haver teste | Caso 3 não chamado                                | Correção semântica ainda sem confirmação real                                                   |
| Arcano usou saída incompatível com contrato               | Caso 6 não chamado; caso 1 também violou envelope | Conformidade estrutural continua sendo obstáculo real, sem atribuir a mesma causa às falhas 5.4 |
| Ambiguidade falhou no schema e recuperou com segurança    | Caso 7 não chamado                                | Recuperação segura não comprova interpretação; regressão semântica permanece pendente           |
| OOC acrescentou “reviravoltas” sem fonte                  | Caso 8 não chamado                                | Nenhuma evidência real nova sobre fundamentação OOC                                             |
| Não havia esta consulta de memória direcionada            | Campos brutos de 561-01 corretos                  | Evidência limitada de distinção de consulta; fluxo não continuou                                |

O contraste entre casos 3 e 4 passou somente no replay roteirizado. Não há evidência
real para afirmar que o Gemini os distingue. Observação, conjuração, ambiguidade e
OOC permanecem não demonstrados por esta amostra.

## Preservação, pendências e decisão

Os hashes antes/depois coincidem para `.env`, prompts, contratos, adaptador, roteador
e políticas congeladas. O hash SHA-256 da `.env` permaneceu
`f7e4a08fdcd9ec6667ec5769afc97ba9311909ef3f7235db05406435b5ec7042`.
Ao final, a configuração efetiva voltou ao default `AI_FREE_TIER_CONFIRMED=false`;
Gemini, modelo e fallback false permanecem os mesmos. Não houve mudança de billing,
chave, banco, campanha, regras ou PDFs. Não foi iniciada a Fase 5.7.

Pendências que afetam a interpretação: garantir um envelope gerável válido; reavaliar
a consulta completa; obter evidência real de observação, contraste investigação com
e sem política, consulta versus execução arcana, ambiguidade e fundamentação OOC.
Não são incluídas pendências mecânicas de Blue Rose.

**Orçamento adicional proposto, não autorizado nem executado:** após eventual
correção e testes offline, até oito novas chamadas PROPOSE Gemini no mesmo modelo,
700 tokens de saída cada (teto de 5.600), uma por cenário, sem retries/fallback.
Entrada e latência futuras são desconhecidas; não são estimadas como zero.
As sete tentativas não utilizadas deste lote não foram automaticamente reutilizadas.

**Decisão: BLOQUEADA.** A amostra foi interrompida pela regra obrigatória de schema
no primeiro cenário. Um campo semântico correto em saída inválida não atende aos
oito critérios direcionados. Não se aprova a amostra, a autonomia da Una ou a campanha.
