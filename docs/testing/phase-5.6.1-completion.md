# KHAOS — conclusão da avaliação semântica real da Una

01/11/2026, America/Sao_Paulo. **PARCIALMENTE APROVADA.** A rodada autorizada
terminou: cinco tentativas reais, quatro casos aprovados integralmente e uma
divergência de parâmetro no 561-06. Os oito cenários originais foram avaliados,
em nove tentativas históricas; seis cenários têm aprovação integral. Os resultados
anteriores permanecem inalterados.

## A. Resultado dos cinco casos

| Caso                           | Esperado                                                             | Gemini recebido                                                              | NestJS local                                                                               | Classificação                                        |
| ------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 561-02 — observação            | OBSERVE / DIRECT; Porta; fonte PUBLIC; sem teste                     | OBSERVE / OBSERVE / DIRECT; WORLD/Porta; fonte exata                         | OBSERVE autorizado; descrição literal; sem efeito                                          | **APROVADA NA AMOSTRA**                              |
| 561-05 — pergunta sobre Arcana | QUERY ou OOC / QUERY RULES / QUESTION                                | QUERY / QUERY RULES / QUESTION; alvo null; fonte exata                       | OOC informativo autorizado; regra literal; sem conjuração ou custo                         | **APROVADA NA AMOSTRA**                              |
| 561-06 — execução de Escudo    | ARCANA / DIRECT; psychic-shield; raised=true; sem parâmetro inferido | ARCANA / ARCANA / DIRECT; psychic-shield; raised=true; **tradition=PSYCHIC** | MECHANIC autorizado; comando somente com arcano, protagonista e raised; sem executar motor | **REPROVADA SEMANTICAMENTE** por parâmetro inventado |
| 561-07 — ambiguidade           | ARCANA / CLARIFY / DIRECT; sem escolher arcano ou alvo               | ARCANA / CLARIFY / DIRECT; alvo null; pede arcano e alvo                     | CLARIFY, CLARIFICATION_REQUIRED; sem execução                                              | **APROVADA NA AMOSTRA**                              |
| 561-08 — pergunta OOC          | OOC ou QUERY / QUERY RULES / QUESTION                                | OOC / QUERY RULES / QUESTION; alvo null; fonte exata                         | OOC autorizado; texto literal da política; sem promessa de reviravolta                     | **APROVADA NA AMOSTRA**                              |

As cinco respostas brutas passaram diretamente em `SelectedFreeAction`/Pydantic
e no Zod. Sem falha de schema, fallback, reparo, retry, troca de modelo ou erro de
provedor nesta rodada. Modelo solicitado e reportado em todos os cinco recibos:
`gemini-3.5-flash-lite`.

### Mensagens, alvos e fontes

| Caso   | Mensagem original, sem reformulação                                                                            | Alvo recebido                                   | Evidência selecionada                                         |
| ------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| 561-02 | Olho atentamente para a fechadura.                                                                             | WORLD/Porta, coerente com a fechadura           | `info-59f40a209c6f283318a8d3fe`, PUBLIC da Porta              |
| 561-05 | Una, como funciona o arcano Escudo? Preciso gastar alguma coisa para utilizá-lo?                               | null, apropriado à consulta de regras           | `info-ab7b61cdf63b4a5fb09fce2a`, RULES de Escudo              |
| 561-06 | Eu ergo meu Escudo.                                                                                            | null; protagonista vinculada pelo servidor      | [] — capacidade conhecida apresentada em features             |
| 561-07 | Quero usar minha magia nele.                                                                                   | null, sem antecedente escolhido arbitrariamente | [] — pede esclarecimento                                      |
| 561-08 | Fora do RPG: como eu sei quando uma sessão terminou? A história sempre vai ter alguma reviravolta antes disso? | null, apropriado à consulta OOC                 | `info-441d1e9142e76c5c865c5fd7`, RULES da política de sessões |

As fontes completas, os JSONs brutos, campos esperados/recebidos, validações,
recusas, tokens e latências estão no [recibo real](../ai/phase-5.6.1-completion-live-result.json)
e na [revisão direta dos JSONs originais](../ai/phase-5.6.1-completion-review.json).
Nenhum campo foi corrigido para obter um acerto. A revisão recalculou a rubrica
congelada sobre o JSON bruto e confirmou os mesmos resultados do avaliador.

## B. Histórico consolidado

| Caso / tentativa      | Intenção e ferramenta recebidas                  | Expressão esperada → recebida | Contrato Pydantic / Zod         | Autorização local                             | Resultado                                          |
| --------------------- | ------------------------------------------------ | ----------------------------- | ------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| 561-01 / 1, histórica | QUERY / QUERY MEMORY, fonte KNOWN correta        | QUESTION → QUESTION           | Inválido / inválido: kind=QUERY | Não avaliável; contrato bloqueado             | Falha operacional, seleção semântica bruta correta |
| 561-01 / 2, histórica | QUERY / QUERY MEMORY, fonte KNOWN correta        | QUESTION → DIRECT             | Válido / válido                 | QUERY autorizado                              | Falha semântica de expressão                       |
| 561-02 / 1, nova      | OBSERVE / OBSERVE                                | DIRECT → DIRECT               | Válido / válido                 | OBSERVE autorizado                            | Aprovada na amostra                                |
| 561-03 / 1, histórica | INVESTIGATE / PREPARED_CHECK, capacidade correta | DIRECT → DIRECT               | Válido / válido                 | MECHANIC, teste pendente                      | Aprovada na amostra                                |
| 561-04 / 1, histórica | INVESTIGATE / ADJUDICATE                         | DIRECT → DIRECT               | Válido / válido                 | ADJUDICATE, UNSUPPORTED_CAPABILITY            | Aprovada na amostra; limitação esperada            |
| 561-05 / 1, nova      | QUERY / QUERY RULES                              | QUESTION → QUESTION           | Válido / válido                 | OOC informativo autorizado                    | Aprovada na amostra                                |
| 561-06 / 1, nova      | ARCANA / ARCANA psychic-shield                   | DIRECT → DIRECT               | Válido / válido                 | MECHANIC autorizado, sem encaminhar tradition | Falha semântica de parâmetro                       |
| 561-07 / 1, nova      | ARCANA / CLARIFY                                 | DIRECT → DIRECT               | Válido / válido                 | CLARIFY, CLARIFICATION_REQUIRED               | Aprovada na amostra; esclarecimento esperado       |
| 561-08 / 1, nova      | OOC / QUERY RULES                                | QUESTION → QUESTION           | Válido / válido                 | OOC informativo autorizado                    | Aprovada na amostra                                |

As tentativas do 561-01 continuam separadas. O erro de envelope original não foi
apagado pela confirmação posterior. 561-03/04 não foram chamados novamente.
O relatório anterior de bloqueio por canonicidade também foi preservado como
evidência histórica; esta conclusão registra a rodada posterior à correção 5.6.2.

## C. Problemas semânticos

1. **Moderado, novo — 561-06:** `tradition=PSYCHIC` não foi declarado pela
   jogadora nem autorizado pelo gabarito. Intenção, arcano, raised, expressão e
   ausência de alvo arbitrário estão corretos, mas o caso falha em
   `INVENTED_PARAMETER:tradition`. Não se aceita o parâmetro por parecer plausível.
2. **Localizado, histórico — 561-01, segunda tentativa:** DIRECT em pergunta cujo
   gabarito exige QUESTION. Mantido como reprovação semântica, apesar de a consulta
   e a fonte terem sido autorizadas.
3. **Operacional, histórico — 561-01, primeira tentativa:** envelope kind=QUERY.
   O schema corrigido não repetiu essa falha nas respostas posteriores observadas;
   isso não comprova confiabilidade universal.

Não houve erro observado de intenção, tipo de ferramenta, fonte selecionada,
sigilo ou descoberta inventada nas cinco novas respostas. A pergunta bruta do
561-07 usa “arcanum”; o servidor retorna “Qual arcano deseja utilizar e em quem?”.
Isso não altera sua aprovação semântica e não certifica qualidade literária.

## D. Contratos, autorização e preflight

Foram inspecionados os relatórios 5.6/5.6.1/5.6.2, plano congelado, avaliador,
adaptador Gemini, roteador, projeção de contexto, grafo, schemas e política NestJS.
O schema remoto usa enum de um valor para os literais; `kind` exige `FREE`.
O schema local continua estrito. O grafo usa `SelectedFreeAction` e PROPOSE com
700 tokens. O SDK mantém attempts=1; cada cenário recebe roteador limitado a uma
requisição, sem fallback. Apenas o request de produção entra no prompt; gabaritos
e propostas offline ficam fora dele.

| Verificação antes das chamadas                                     | Resultado                                            |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| Build de contratos e API                                           | Ambos passaram                                       |
| Python: schema Gemini, 5.6, avaliador 5.6.1, protocolo 5.6.2, 5.5  | 247 passaram, 5,140 s                                |
| NestJS: schema entre linguagens, seleção, publicação, ações livres | 173 passaram, 2,549 s                                |
| Integração: canonicidade, 5.6, narrativa, 5.5                      | 57 passaram, 56,475 s                                |
| Total do recorte offline                                           | **477 aprovados; zero falhas na execução concluída** |

Inclui 561-03/04 roteirizados, galeria parafraseada, fracasso oficial, descoberta
legítima, fundamentação informativa, proteção privada, memória, histórico,
recuperação e canais públicos. Não se atribui acurácia Gemini aos testes simulados.

O sandbox inicialmente bloqueou a porta local do banco, o event loop Python e
subprocessos de compatibilidade. O processo Python bloqueado foi interrompido;
os recortes foram reexecutados fora do sandbox com autorização operacional e
passaram sem alteração do código. Os erros de persistência injetados pelos testes
de integração são esperados. Banco exclusivamente descartável, nomeado
`solorpg-test-*`, destino `/solorpg_test`; o runner remove somente seus próprios
recursos. Nenhum banco/campanha real foi acessado para escrita.

**Semântica, contrato e autorização são avaliações independentes.** No 561-06,
o contrato genérico de Arcana permite estruturalmente tradition. A política de
`psychic-shield` constrói o comando específico somente com arcanum, characterId
e raised. A tradição extra não é encaminhada ao motor. Isso é a projeção existente
do comando, não uma recusa semântica nem uma correção da resposta do modelo. O
JSON bruto e o erro permanecem registrados. Não se declara que o NestJS detectou
a inferência indevida: ele limitou corretamente o comando encaminhável.

O replay importa Zod e funções compiladas de produção. Não inicia aplicação,
conecta banco ou executa o Game Engine. Portanto, a chamada real certifica seleção
e autorização local do comando proposto, não uma execução real completa de Blue
Rose. A execução e persistência estão cobertas pelas regressões offline apropriadas.

[Preflight, hashes e autorização](../ai/phase-5.6.1-completion-preflight.json).

## E. Proteção narrativa e preservação

A fronteira da 5.6.2 permanece ativa: catálogo recomposto pelo servidor, comparação
integral dos fragmentos e publicação de `validation.narration`. O teste da galeria
inventada passou com sua expectativa original. Fracasso continua fracasso;
descoberta legítima depende do resultado oficial. Memória HEARD/RUMOR continua
atribuída, sem conversão em verdade ou transferência entre personagens.

Na rodada real, OBSERVE/QUERY/OOC resolveram somente textos literais das fontes
autorizadas. A segurança dos demais caminhos de publicação foi verificada offline;
**não houve chamada NARRATE real**. Seleção de fontes e schema não demonstram
variedade, naturalidade, coesão ou personalidade da prosa publicada.

Hashes de 360 arquivos preexistentes conferidos após a rodada: todos preservados,
incluindo produção, testes, prompts, plano, recibos, `.env`, documentos de regras e
aventuras. Foram adicionados somente documentos/evidências desta conclusão no
repositório. Não houve correção de produção durante a avaliação.

A chave ativa mantém a identidade por hash da `.env` histórica, sem override no
ambiente. Projeto gratuito e faturamento desativado continuam sendo atestação
expressa do operador; não foram verificados por consulta administrativa ao Google.
`AI_FREE_TIER_CONFIRMED=true` foi definido somente no processo autorizado.
Configuração permanente continua false; modelo, chave e fallback não foram alterados.

## F. Consumo e métricas consolidadas

| Caso / tentativa             |    Entrada |     Saída | Total reportado |      Latência |
| ---------------------------- | ---------: | --------: | --------------: | ------------: |
| 561-01 / 1, histórica        |      2.095 |       137 |           2.232 |      1.672 ms |
| 561-01 / 2, histórica        |      2.095 |       138 |           2.233 |      2.040 ms |
| 561-02 / 1                   |      2.043 |       133 |           2.176 |      2.569 ms |
| 561-03 / 1, histórica        |      2.066 |       144 |           2.210 |      2.132 ms |
| 561-04 / 1, histórica        |      2.044 |       132 |           2.176 |      2.036 ms |
| 561-05 / 1                   |      2.188 |       122 |           2.310 |      2.723 ms |
| 561-06 / 1                   |      2.041 |       129 |           2.170 |      1.533 ms |
| 561-07 / 1                   |      2.082 |        95 |           2.177 |      1.656 ms |
| 561-08 / 1                   |      2.214 |       120 |           2.334 |      1.844 ms |
| **Nova rodada**              | **10.568** |   **599** |      **11.167** | **10.325 ms** |
| **Histórico completo 5.6.1** | **18.868** | **1.150** |      **20.018** | **18.205 ms** |

Latências são as durações reportadas pelo roteador por tentativa; somas não incluem
todo o tempo de preparação/replay. Nenhum consumo foi estimado ou omitido como zero.

| Métrica                                                 |  Nova rodada | Histórico completo |
| ------------------------------------------------------- | -----------: | -----------------: |
| Cenários únicos avaliados                               |            5 |                  8 |
| Tentativas                                              | 5 / limite 5 |                  9 |
| Casos com aprovação integral                            |            4 |                  6 |
| Seleções brutas semanticamente corretas                 |            4 |                  7 |
| Seleções brutas semanticamente incorretas               |            1 |                  2 |
| Falhas de schema                                        |            0 |                  1 |
| Falhas de expressão                                     |            0 |                  1 |
| Falhas de intenção / tipo de ferramenta / fundamentação |    0 / 0 / 0 |          0 / 0 / 0 |
| Falhas de parâmetro                                     |            1 |                  1 |
| Decisões de autorização local corretas e avaliáveis     |            5 |                  8 |
| Propostas autorizadas localmente                        |            4 |                  6 |
| Limitações esperadas: ADJUDICATE / CLARIFY              |        0 / 1 |              1 / 1 |
| Contratos inválidos bloqueados                          |            0 |                  1 |
| Propostas semanticamente incorretas bloqueadas          |            0 |                  0 |
| Erros externos de provedor / uso desconhecido           |        0 / 0 |              0 / 0 |

As sete seleções brutas corretas incluem a primeira resposta 561-01, cujo envelope
era inválido. Ela **não** conta como resposta operacional aprovada. As duas
propostas semanticamente incorretas válidas não foram recusadas: a expressão DIRECT
passou estruturalmente no 561-01 e a tradição extra passou no 561-06, permanecendo
fora do comando específico. Os bloqueios esperados de 561-04/07 são comportamentos
corretos. O contrato inválido original nem chegou à autorização semântica.

Nesta autorização: zero retries, reparos, fallback de provedor, fallback do grafo,
chamadas literárias e efeitos executados. O fallback do grafo da primeira tentativa
histórica continua registrado em seu recibo e não recebe crédito de acerto.

[Resumo estruturado consolidado](../ai/phase-5.6.1-completion-summary.json).

## G. Pendências

- **Interpretação da Una:** corrigir separadamente a expressão do 561-01 e a
  inferência de tradition no 561-06. Qualquer correção de produção e sua eventual
  confirmação remota exigem uma tarefa posterior; esta rodada não fez reparos.
- **Fundamentação:** fontes corretas na amostra; isso não mede todo contexto,
  relevância universal, material ausente ou atualidade das fontes preparadas.
- **Qualidade literária:** catálogo restrito, falas e perguntas fixas e descrições
  literais podem repetir-se. Ainda não há avaliação real multiturmo de variedade,
  voz, naturalidade, resposta pertinente à jogadora, ritmo ou agência de Naelis.
- **Exploração:** ausência de política continua levando à adjudicação, sem
  dificuldade, mapa ou descoberta inventados; não há certificação de exploração
  irrestrita ou campanha integral sem operador.
- **Mecânicas Blue Rose:** permanecem as [pendências existentes](../rules/blue-rose-pending-rules.md),
  sem expansão de regras para acomodar resultados do modelo. Nenhuma Fase 5.7 iniciada.

## H. Próximo passo

**A condição “os cinco testes satisfatórios” não foi atendida: quatro de cinco
passaram.** Recomenda-se resolver primeiro as divergências 561-01 e 561-06 em
trabalho separado. Não foi iniciada nem implementada a avaliação 5.6.3.

Na futura Fase 5.6.3, a meta deve continuar sendo um romance interativo: Naelis é
controlada pela jogadora; Una interpreta o mundo e os demais personagens com voz,
naturalidade e fidelidade à aventura. A avaliação precisará observar sequências de
turnos, repetição de frases/perguntas, variedade contextual, personalidade e
pertinência das réplicas, preservando a fronteira determinística e os resultados
oficiais. Uma seleção segura de fragmentos não basta para afirmar essa experiência.

A rodada atual está concluída e sua autorização foi consumida. Não há novas
chamadas agendadas, autonomia completa declarada ou certificação de Gloamhale
integralmente jogável sem operador.
