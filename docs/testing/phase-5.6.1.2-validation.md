# KHAOS — Fase 5.6.1.2: confirmação semântica real

02/11/2026, America/Sao_Paulo. **APROVADA NA AMOSTRA: dois casos aprovados,
duas tentativas reais, execução encerrada.** Nenhuma chamada adicional autorizada
ou agendada. A Fase 5.6.3 permanece bloqueada até avaliação do operador.

## A. Preflight e autorização

O [preflight offline](../ai/phase-5.6.1.2-preflight.json) passou antes do pedido de
autorização. Foram conferidos os relatórios [5.6.1.1](phase-5.6.1.1-validation.md),
[conclusão 5.6.1](phase-5.6.1-completion.md), schema, confirmação histórica de memória,
[publicação 5.6.2](phase-5.6.2-validation.md), plano congelado, recibos, contratos
Pydantic/Zod, MASTER/PROPOSE, grafo/projeção, adaptador, roteador, avaliador e replay
de interpretação/autorização NestJS.

| Verificação                                       | Resultado                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Implementação da 5.6.1.1                          | Presente e ativa; hashes correspondem à entrega offline                         |
| Distinção QUESTION/DIRECT e descrições espelhadas | Presentes no prompt e no schema de geração                                      |
| Recusa ARCANA_PARAMETER_MISMATCH                  | Presente antes da construção do comando                                         |
| Provedor/modelo configurados                      | Gemini / gemini-3.5-flash-lite                                                  |
| Modelo reportado nas duas respostas               | gemini-3.5-flash-lite                                                           |
| Fallback e retries                                | Fallback de provedor false; SDK attempts=1; sem repetição automática            |
| Schema remoto                                     | kind=FREE via enum; SelectedFreeAction exige expression/evidence                |
| Mensagens/contextos/gabaritos                     | Iguais aos registros congelados, antes e depois das chamadas                    |
| Fronteira de publicação 5.6.2                     | Código preservado; regressões aprovadas                                         |
| Configuração financeira permanente                | Preservada; AI_FREE_TIER_CONFIRMED continua false                               |
| Identidade da chave                               | Arquivo .env preservado por hash, sem override no ambiente; segredo não exposto |

### Preflight offline executado

| Recorte                                                                                                 | Resultado                          |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Python: schema Gemini, seleção 5.6, avaliador, precisão 5.6.1.1, publicação 5.6.2 e memória/menções 5.5 | 262 passaram, zero falhas; 6,25 s  |
| NestJS: schema entre linguagens, seleção, precisão, publicação e ações livres                           | 221 passaram, zero falhas; 3,639 s |
| Integração de canonicidade e 5.6/5.6.1.1                                                                | 26 passaram, zero falhas; 53,664 s |
| Contratos compartilhados                                                                                | 13 passaram, zero falhas           |
| Builds dos contratos e da API                                                                           | Ambos passaram                     |
| Total                                                                                                   | **522 testes aprovados**           |

Respostas simuladas, transporte HTTP em memória e PostgreSQL exclusivamente
descartável (`solorpg-test-*`, banco `/solorpg_test`). Permissões operacionais para
esses testes fora do sandbox não foram consideradas autorização Gemini. Nenhum
teste simulado foi contado como acerto semântico real.

Depois desse resultado, o operador autorizou expressamente esta rodada de duas
requisições, uma para cada caso, e reconfirmou que a chave ativa pertence ao projeto
gratuito com faturamento desativado. Não houve reutilização de autorização histórica.
Essa identificação financeira é atestação do operador; não houve consulta
administrativa ao Google Cloud ou alteração de billing.

[Autorização nova e atestação](../ai/phase-5.6.1.2-authorization.json).
Os hashes dos 373 arquivos existentes foram reconferidos imediatamente antes das
chamadas. A confirmação gratuita foi ativada somente no processo autorizado:

```sh
AI_FREE_TIER_CONFIRMED=true node scripts/uv.mjs run python -m app.evaluation.phase561 --authorize-live --operator-key-confirmed --max-requests 2 --case-ids 561-01 561-06 --output /home/barreto/Desktop/projetos/soloRPG/docs/ai/phase-5.6.1.2-live-result.json
```

O orquestrador existente criou o recibo exclusivamente e reservou uma tentativa por
caso antes de chamar o SDK. Usou grafo, prompt, schema, adaptador e roteador de
produção; apenas o request congelado entrou no grafo, sem objeto de gabarito ou
prompt especial de avaliação. Não houve reparo, retry, fallback, NARRATE, mudança
de modelo ou erro de interrupção. A execução terminou após duas tentativas.

## B. Resposta original de cada caso

### 561-01 — pergunta sobre conhecimento anterior

Mensagem: **“O que eu já descobri sobre essa porta?”**

JSON original capturado do SDK:

```json
{
  "kind": "FREE",
  "intent": "QUERY",
  "description": "Naelis consulta suas lembranças sobre o que já descobriu a respeito da porta.",
  "target": {
    "type": "WORLD",
    "name": "Porta"
  },
  "expression": "QUESTION",
  "evidence": ["info-b8009dbd5409f0d34e434465"],
  "tool": {
    "type": "QUERY",
    "subject": "MEMORY"
  }
}
```

### 561-06 — ação arcana sem parâmetro inferido

Mensagem: **“Eu ergo meu Escudo.”**

JSON original capturado do SDK:

```json
{
  "kind": "FREE",
  "intent": "ARCANA",
  "description": "Naelis ergue o Escudo Psíquico.",
  "target": null,
  "expression": "DIRECT",
  "evidence": [],
  "tool": {
    "type": "ARCANA",
    "arcanum": "psychic-shield",
    "raised": true,
    "tradition": null,
    "use": null,
    "fatigue": null,
    "category": null
  }
}
```

O [recibo real completo](../ai/phase-5.6.1.2-live-result.json) permanece no formato
original do avaliador, com requests, gabaritos congelados, texto bruto, modelo,
validações e uso. Não foi reescrito para aparentar aprovação.

## C. Comparação detalhada entre esperado e observado

| Campo                                | 561-01 esperado                               | 561-01 observado                          | Resultado |
| ------------------------------------ | --------------------------------------------- | ----------------------------------------- | --------- |
| kind                                 | FREE                                          | FREE                                      | Aprovado  |
| intent                               | QUERY                                         | QUERY                                     | Aprovado  |
| expression                           | QUESTION                                      | QUESTION                                  | Aprovado  |
| tool/subject                         | QUERY / MEMORY                                | QUERY / MEMORY                            | Aprovado  |
| target                               | WORLD / Porta                                 | WORLD / Porta                             | Aprovado  |
| evidence                             | info-b8009dbd5409f0d34e434465, KNOWN original | Mesma chave exata, sem fontes adicionais  | Aprovado  |
| Resultado informativo autorizado     | Texto literal da fonte KNOWN                  | Mesmo texto, sem acréscimos               | Aprovado  |
| Nova investigação, rolagem ou efeito | Nenhum                                        | Nenhum comando, opção ou efeito executado | Aprovado  |

Fonte KNOWN e resposta informativa calculada pelo servidor:

> Uma investigação anterior confirmou que a fechadura da Porta está danificada.

Isso é recuperação de descoberta anterior, sem preparação de teste novo. A
description do modelo descreve uma consulta; não acrescenta descoberta.

| Campo                | 561-06 esperado                                   | 561-06 observado                      | Resultado |
| -------------------- | ------------------------------------------------- | ------------------------------------- | --------- |
| kind                 | FREE                                              | FREE                                  | Aprovado  |
| intent               | ARCANA                                            | ARCANA                                | Aprovado  |
| expression           | DIRECT                                            | DIRECT                                | Aprovado  |
| tool/arcanum         | ARCANA / psychic-shield                           | ARCANA / psychic-shield               | Aprovado  |
| raised               | true explícito                                    | true                                  | Aprovado  |
| target               | Sem alvo arbitrário; candidato congelado usa null | null                                  | Aprovado  |
| evidence             | []                                                | []                                    | Aprovado  |
| tradition            | Nenhum valor inferido                             | null                                  | Aprovado  |
| use/fatigue/category | Nenhum valor inferido                             | Todos null                            | Aprovado  |
| Resultado mecânico   | Não inventar resultado ou executar motor          | Somente proposta; replay sem execução | Aprovado  |

Null/omissão já representam ausência de escolha nos schemas e no gabarito original:
o avaliador congelado reprova esses parâmetros quando o valor é não nulo. O JSON
bruto já contém null, antes do Zod. Não houve conversão de PSYCHIC para null nem
relaxamento posterior do critério. A description nomeia a ação proposta, sem
inventar teste, sucesso, custo ou consequência.

## D. Resultado do Pydantic

**Duas respostas válidas, zero falhas estruturais.** Além da validação feita pelo
adaptador de produção, os dois textos originais do SDK foram revalidados diretamente
por `SelectedFreeAction.model_validate_json`. FREE, tipos de ferramentas, campos
obrigatórios e campos extras continuam sujeitos ao schema estrito. Nenhuma resposta
inválida foi reparada, substituída ou creditada ao Gemini.

## E. Resultado do Zod

**Duas respostas válidas, zero falhas estruturais.** O replay recebeu o objeto
resultante de interpretar o JSON bruto original, sem passar pela serialização
Pydantic como substituto. A revalidação direta produziu os mesmos resultados
registrados pelo avaliador durante a rodada. O tratamento legado de null no Zod
não encobriu valor inferido: a revisão semântica foi recalculada sobre o JSON bruto.

## F. Resultado da autorização NestJS

| Caso   | Resolução                              | Autorização | Execução                                                 |
| ------ | -------------------------------------- | ----------- | -------------------------------------------------------- |
| 561-01 | QUERY, alvo Porta, fonte KNOWN exata   | AUTHORIZED  | Nenhum efeito; resposta informativa literal, eventIds=[] |
| 561-06 | MECHANIC, comando específico de Escudo | AUTHORIZED  | Somente replay; motor não chamado                        |

Comando calculado para 561-06, sem executá-lo:

```json
{
  "type": "ARCANA_USE",
  "input": {
    "arcanum": "psychic-shield",
    "characterId": "00000000-0000-4000-a000-000000000001",
    "raised": true
  }
}
```

O ID da protagonista é resolvido pelo servidor a partir do contexto sintético,
não fornecido pelo modelo. Nenhuma tradição foi selecionada ou encaminhada.
`ARCANA_PARAMETER_MISMATCH` não foi acionado porque a nova proposta não contém
valor incompatível. Sua eficácia permanece coberta pelas regressões offline; não
se atribui ao Gemini o mérito de uma recusa que não ocorreu nesta chamada.

O replay importa funções compiladas e schemas de produção. Não inicia aplicação,
conecta banco, confirma resultados mecânicos ou publica mensagem em campanha.
Portanto, esta rodada não é uma nova validação de execução integral de Blue Rose.

## G. Resultado semântico separado do estrutural

| Caso   | Semântica                                            | Pydantic | Zod    | Autorização | Classificação           |
| ------ | ---------------------------------------------------- | -------- | ------ | ----------- | ----------------------- |
| 561-01 | Correta: QUESTION, consulta de memória e fonte exata | Válido   | Válido | Correta     | **APROVADA NA AMOSTRA** |
| 561-06 | Correta: Escudo/raised=true, sem escolhas adicionais | Válido   | Válido | Correta     | **APROVADA NA AMOSTRA** |

**A amostra de dois casos foi integralmente aprovada.** A revisão independente
recalculou o gabarito congelado sobre as respostas brutas e conferiu também kind,
alvos, ausência de escolhas adicionais, texto da fonte e comando exato. Nenhum
erro semântico foi transformado em aprovação por schema, recusa ou fallback.

Os resultados históricos permanecem separados:

| Evidência histórica          | Resultado mantido                                         | Resultado desta rodada                                  |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| 561-01, tentativa inicial    | Envelope kind=QUERY inválido, sem aprovação operacional   | Não reescrito                                           |
| 561-01, confirmação anterior | DIRECT em vez de QUESTION: reprovado semanticamente       | Nova tentativa QUESTION, aprovada                       |
| 561-06, rodada anterior      | tradition=PSYCHIC não declarado: reprovado semanticamente | Nova tentativa com parâmetros adicionais null, aprovada |

Não se reclassificam as tentativas antigas nem se apresenta uma média histórica
como se todas as respostas tivessem sido geradas sob o mesmo prompt e política.

## H. Consumo real de tokens e latência

| Caso                        |       Tentativas | Entrada reportada | Saída reportada | Total reportado |     Latência |
| --------------------------- | ---------------: | ----------------: | --------------: | --------------: | -----------: |
| 561-01                      |                1 |             2.598 |             141 |           2.739 |     5.408 ms |
| 561-06                      |                1 |             2.544 |             126 |           2.670 |     1.940 ms |
| **Total desta autorização** | **2 / limite 2** |         **5.142** |         **267** |       **5.409** | **7.348 ms** |

Ambas ficaram abaixo de 700 tokens de saída. Uso reportado nas duas tentativas;
zero consumo desconhecido, erros de provedor ou falhas de schema. Latência é a
duração de cada tentativa registrada pelo roteador; a soma não inclui preparação,
replays ou redação do relatório. Nenhum valor foi estimado.

Retries, fallback de provedor/grafo, reparos por LLM, chamadas NARRATE e chamadas
adicionais: **zero**. A autorização foi consumida e encerrada, sem saldo de
tentativas reutilizável. Não houve alteração de billing ou configuração financeira.

## I. Preservação da Fase 5.6.2

Hashes dos 373 arquivos existentes continuam iguais antes e depois da rodada,
incluindo produção, schemas, políticas, testes, plano, recibos/revisões históricos,
`.env`, PDFs, regras e definições/digests de aventuras. Nenhum arquivo de produção
foi modificado para obter aprovação. Apenas documentos/evidências desta fase foram
criados ou atualizados.

A fronteira conserva catálogo recomposto pelo servidor, comparação integral dos
fragmentos e publicação de `validation.narration`. Galeria inventada, paráfrases,
fracasso oficial, descoberta legítima e canais públicos permanecem nas regressões
ativas e passaram no preflight. A consulta real selecionou a fonte correta; o texto
informativo do replay também passou no renderer sem acréscimos.

Não houve NARRATE real nesta rodada. A proteção geral de publicação está coberta
offline e por preservação do código, sem alegação de nova certificação literária.
Nenhum banco/campanha real foi escrito. Configuração permanente continua com
confirmação gratuita false, fallback false, chave e modelo preservados.

## J. Pendências remanescentes

- Os dois erros específicos não reapareceram nesta amostra real, mas uma tentativa
  por caso não demonstra confiabilidade universal ou causalidade isolada da mudança
  de prompt. Os exemplos contrastivos fazem parte do prompt atual de produção;
  esta é uma confirmação dirigida, não uma amostra independente de generalização.
- Escolhas aplicáveis a outros arcanos ainda podem ser inferidas incorretamente
  pelo modelo; o guard verifica aplicabilidade, não toda a semântica do português.
- Fundamentação depende das fontes autorizadas disponíveis e de sua autoria.
  Casos novos, exploração irrestrita e mecânicas Blue Rose pendentes conservam seus
  limites anteriores. Não foi iniciada a Fase 5.7.
- Qualidade literária, variedade entre turnos, naturalidade e personalidade da Una
  ainda não foram medidas nesta rodada PROPOSE. Nenhuma chamada literária adicional
  foi realizada.
- A decisão de liberar a próxima fase pertence ao operador. Nenhuma nova execução
  ou chamada foi agendada.

[Revisão direta, métricas e hashes finais](../ai/phase-5.6.1.2-review.json).

## K. Recomendação fundamentada sobre a Fase 5.6.3

As duas correções tiveram confirmação real satisfatória **nestes dois casos**.
Recomenda-se considerar a avaliação de qualidade literária em uma tarefa separada,
após revisão destes resultados pelo operador, preservando o catálogo autorizado e
os resultados oficiais do motor. Essa etapa deverá tratar repetição, naturalidade,
personalidade e pertinência das respostas em sequências de turnos, sem retirar da
jogadora o controle de Naelis.

**A Fase 5.6.3 permanece bloqueada até a avaliação e liberação do operador, conforme
sua instrução expressa.** Não foi iniciada automaticamente. Não se declara autonomia
completa da Una nem uma campanha inteira validada.
