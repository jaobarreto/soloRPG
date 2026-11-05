# KHAOS — Fase 5.6.3C.0: preparação da avaliação literária

02/11/2026. **Diagnóstico e preparação offline concluídos, para revisão.** Nenhuma
chamada Gemini/Groq, melhoria de produção ou aprovação literária do Gemini.
Fases C.1, 5.7 e 5.8 não iniciadas. A falha histórica de formatação continua
separada dos testes dirigidos aprovados; não se declara aprovação global do workspace.

## A. Diagnóstico e baseline

Foram lidos A/B/B.0/B.1, Story Cards, G1/G2, renderer/ADR 0011, fronteira 5.6.2,
contratos, memória, Director e avaliações 5.4/5.6. Os textos históricos foram
confrontados com código e recibos. O inventário inicial preserva 432 arquivos,
inclusive mudanças anteriores não commitadas. Antes de criar os arquivos desta
fase, foi apresentado o diagnóstico por responsabilidade.

Baseline histórica B.1: 509 testes NestJS/35 suítes, 360 Python, 15 contratos e
7 web. Não se renomeia essa execução como sendo C.0, nem se soma a ela uma rodada
parcial para declarar uma suíte global atual. O format:check já falhava em 19
JSONs históricos; nenhum deles foi reformatado.

Causas observadas no código atual:

1. G1/G2 tem 34 fragmentos, 17 por voz, quatro assuntos e oito atos; cada par
   elegível tem somente 1–2 variantes. Voz revisada é perfil, não identidade completa.
2. O texto v1 explicita “resultado confirmado”, “não comprova” e outras distinções
   técnicas em diálogo. A atribuição HEARD é necessária; essa formulação é editorial.
3. O renderer não recebe histórico recente dos fragmentos publicados. Impede
   duplicata dentro da resposta, mas não entre turnos. Recitar memórias de réplicas
   continua possível pelo catálogo legado.
4. Uma fala genérica pode ser aceita mesmo com réplica contextual disponível.
   Autorização não demonstra pertinência nem a melhor decisão de seleção.

Hipóteses não medidas: o Gemini escolheria melhor sem repetir acessórios;
conteúdo novo melhoraria percepção de identidade; G4/G5 reduziriam artificialidade.
Nenhuma hipótese foi tratada como resultado real de modelo ou implementada.

## B. Arquitetura atual de geração e publicação

Mensagem → PROPOSE Python com menu filtrado → interpretação/autoridade NestJS →
commit oficial → contexto NARRATE → seleção de beats → catálogo recomposto na
transação → comparação integral → mensagem/evento/memória da fala realmente
publicada. O grafo concatena beats; não é o autorizador material.

Una escolhe intenção, assunto/ato e ordem dos fragmentos. Biblioteca e preparação
determinam quais frases podem existir. Estado/presença/fontes próprios vêm do
servidor. Speech ou objetivo privado não habilitam outra frase. Director conserva
progresso por evidência, sem usar quantidade de turnos para impor desfechos.

RESULT literal, speakerId, factIds, fontes, versão, identidade e estado atuais
continuam verificados. Uma réplica contextual completa não pode ser combinada
com outra para fabricar uma fala. O modelo não ganhou agente auxiliar, ferramenta,
escrita, paráfrase, reparo ou permissão de publicar texto livre.

[Protocolo detalhado, métricas e rubrica](../ai/phase-5.6.3c-literary-evaluation.md).

## C. Matriz de cenários

[Fixture congelada](../../apps/api/test/fixtures/phase563c0-literary.json): somente
material sintético. Iria e Tessa são REGULAR com motivações/atitudes distintas;
Lior/Líor são INDIVIDUAL da fixture Story Card já existente. Memórias são próprias,
com tipo/modalidade/participação explicitados. Nenhum acontecimento de Gloamhale
foi inventado ou importado para preencher a matriz.

| ID     | Situação                  | Mensagens por seletor | Fontes/condições e foco                                                           |
| ------ | ------------------------- | --------------------: | --------------------------------------------------------------------------------- |
| NAR-01 | Primeira conversa         |                     2 | Sem memória prévia; apresentação e perfil                                         |
| NAR-02 | Conversa persistente      |                     5 | Preocupação, detalhes, discordância, memória própria e esclarecimento             |
| NAR-03 | Discussão anterior        |                     4 | REGULAR, WITNESSED/participação e UNRESOLVED; sem reconciliação                   |
| NAR-04 | Interlocutora desconfiada |                     3 | RESERVED; dúvida/cautela/recusa sem efeito                                        |
| NAR-05 | Interlocutora acolhedora  |                     3 | Mesmas três perguntas, WARM; acolhimento não concede ajuda                        |
| NAR-06 | Pedido a Story Card       |                     3 | INDIVIDUAL opt-in, recusa/limites, sem obediência presumida                       |
| NAR-07 | Promessa ouvida           |                     3 | HEARD/SPEECH_RECORDED próprio; não prova cumprimento                              |
| NAR-08 | Duas vozes por origem     |                     4 | Mesma pergunta em pares REGULAR e STORY_CARD; memória própria                     |
| NAR-09 | Ambiente e descoberta     |                     3 | OBSERVE público, sucesso sintético e QUERY conhecido                              |
| NAR-10 | Busca sem resultado       |                     4 | ABSENT, UNSPECIFIED, fracasso e tentativa sem nova capacidade distintos           |
| NAR-11 | Mudança de sessão         |                     4 | Projeções 1/2, memória própria, outro cast sem fonte, participação não comprovada |
| NAR-12 | Insistência prolongada    |                    12 | Mesmo par com duas variantes; desenvolvimento versus alternância                  |

Os 50 pedidos são exercitados por FIRST_PREPARED e ROTATE_PREPARED: **24 sequências,
100 saídas autorizadas em memória**. São seletores de diagnóstico escritos no
teste, não nova política do produto. O catálogo, as referências e a publicação
são calculados pelos helpers de produção; os contextos são preparados pelo teste.
Não chamar essas saídas novas de mensagens persistidas em campanha.

Limites verificáveis: no novo replay, a elegibilidade Story Card usa manifesto/
definição/IDs de produção em memória, mas não consulta o loader SQL. A integração
existente reexecutada cobre esse loader. Os resultados mecânicos são fixtures,
não novas rolagens. O gate de publicação é real; a afirmação “modelo interpretou
o português” seria falsa nesta etapa.

## D. Sequências de múltiplos turnos

- **A, conversa persistente:** NAR-02 faz pergunta → detalhes → discordância →
  memória anterior → esclarecimento. NAR-07 retoma promessa e pergunta se foi
  cumprida. NAR-12 prolonga o mesmo assunto por 12 pedidos distintos.
- **B, relação conflituosa:** NAR-03 retoma desacordo, pede explicação, nega pedido
  de perdão e retoma o ponto. NAR-11 conserva fontes entre projeções de sessões,
  sem concedê-las ao outro NPC ou promover cast para participante.
- **C, vozes distintas:** NAR-04/05 têm pedidos iguais; NAR-08 pareia vozes dentro
  de cada origem. Não comparar voz mudando ao mesmo tempo a pergunta do par.
- **D, busca sem resultado:** NAR-09/10 distinguem descrição pública, conhecimento,
  resultado oficial e insuficiência. Um fracasso não vira inexistência absoluta;
  só a fonte ABSENT explícita sustenta a afirmação de ausência.

Sessões novas são projeções rotuladas, sem memória criada artificialmente entre
os turnos. A continuidade persistida, o histórico e o replay idempotente são
verificados na integração B.1, não inferidos desses rótulos.

## E. Métricas objetivas

[Resultados completos e definições](../ai/phase-5.6.3c-0-offline-metrics.json).
As contagens são por execução; não misturar seletores como uma conversa única.

| NAR-12, 12 turnos                                | FIRST_PREPARED | ROTATE_PREPARED |
| ------------------------------------------------ | -------------: | --------------: |
| Alternativas preparadas por turno                |              2 |               2 |
| Respostas completas distintas                    |              1 |               2 |
| Respostas adjacentes idênticas                   |             11 |               0 |
| Ocorrências de fragmentos                        |             36 |              36 |
| Fragmentos repetidos além da primeira ocorrência |             33 |              31 |

Baixa repetição adjacente não comprova naturalidade. A cena e QUESTION repetidos
foram selecionados deliberadamente em ambos os controles; o produto já permite
omiti-los. A insuficiência de desenvolvimento também existe na fala: duas variantes
não respondem de forma nova aos pedidos de razões/detalhes.

NAR-07 tem só uma alternativa por par pedido. NAR-11 gera duas clarificações por
falta de fonte/proveniência em cada seletor, sem rejeição de publicação. O controle
GENERIC_OVER_CONTEXTUAL aceita uma fala genérica apesar de duas preparadas: seleção
genérica e fallback não são a mesma métrica.

48 turnos referenciam factIds na projeção própria, todos contidos nela. São
repetições sobre fontes sintéticas, não 48 memórias independentes nem prova de
pertinência. A relevância semântica permanece pendente de revisão citada.

Medidas objetivas: igualdade de texto/fragmento, distribuição, profundidade de
citação, alternativas elegíveis, motivos de clarificação/recusa e referências.
Abertura por pontuação, estrutura por tamanho de sentença, Jaccard e vocabulário
de auditoria são proxies declarados. Não há média, nota literária automática,
teste estatístico de melhoria ou estimativa de custo baseada em caracteres.

## F. Rubrica humana

A [rubrica](../ai/phase-5.6.3c-literary-evaluation.md#rubrica-humana-15) define os
cinco níveis de naturalidade, personalidade, contextualização, continuidade,
variedade, qualidade literária, ritmo, agência, cânone e segurança. Cada nota exige
trecho/turno e justificativa; N/A requer motivo. Notas humanas estão **null**.

Agência, sigilo, resultado contraditório, descoberta/consequência não autorizada
e contradição do cânone são eliminatórios. Nenhuma média pode compensá-los. Uma
resposta segura mas artificial pode passar o gate técnico e falhar literariamente.
Resposta agradável mas irrelevante, natural mas incompatível com o perfil e
excelente/autorizada têm critérios separados. Não atribuímos notas a textos
futuros nem chamamos a revisão editorial do agente de aprovação humana.

## G. Comparação histórica A/B/Story Cards

São os artefatos originais, preservados byte a byte. O comparador exige os mesmos
cenários, mensagens/ordem e seletores A/B. Preparação e seleção B mudaram juntas:
a comparação é descritiva, não causal ou estatística sobre modelos.

| Medida, 29 turnos por seletor                    | A FIRST | B FIRST | A VARIED | B VARIED |
| ------------------------------------------------ | ------: | ------: | -------: | -------: |
| Respostas adjacentes idênticas                   |      10 |       1 |        1 |        1 |
| Fragmentos repetidos além da primeira ocorrência |      50 |      39 |       37 |       35 |
| Profundidade máxima de citação                   |       0 |       0 |        4 |        0 |
| Perguntas genéricas finais selecionadas          |      22 |      22 |       22 |       22 |

O A VARIED recita réplicas que recitam outras réplicas. O B seleciona uma resposta
preparada de desacordo e evita a cadeia nesses turnos; não removeu o mecanismo
legado. G1/G2 melhora disponibilidade/encaixe nesse recorte, sem comprovar prosa
natural nem voz individual complexa.

O B.1 comprova que o cast pode acessar a mesma biblioteca com identidade própria
e fontes HEARD. Seu exemplo continua “Da promessa, posso retomar o que ouvi; não
um resultado confirmado”. Não há amostra longa B.1 pareada com os 58 turnos A/B;
não se calcula ganho percentual literário entre esses conjuntos.

Os recibos de modelos reais 5.3/5.4/5.6/5.6.1.2 são históricos, identificados nos
documentos originais. Não entram nas métricas novas nem certificam a seleção
literária atual. Os resultados C.0 vêm de projeção/política em memória; as
regressões reexecutadas usam grafo real com provedor simulado e PG descartável.

## H. Problemas observados e responsabilidades

| Pergunta                                | Resposta sustentada pela evidência                                                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. G1/G2 tem alternativas suficientes?  | Para alguns atos, só uma; para ANSWER geral/desacordo, duas. NAR-12 demonstra insuficiência para 12 turnos substantivos                                                                   |
| 2. Vozes diferem perceptivelmente?      | Textos diferem, mas compartilham registro. Jaccard dos pares novos varia de 0,2821 a 0,4; percepção humana continua pendente. Mesmo perfil colapsa campos de speech/motivação no controle |
| 3. Estado influencia adequadamente?     | É gate literal e requisito UNRESOLVED, não reação emocional graduada. Protege autorização; não demonstra nuance literária                                                                 |
| 4. Memória está no contexto certo?      | Fontes próprias chegam; cast é HEARD. SQL/lifecycle protegidos na integração. Exposição/pertinência são problemas separados                                                               |
| 5. Fragmentos são adequados ao assunto? | Alguns retomam conflito/promessa corretamente; NAR-02-t3 fala em acusação quando o pedido não a fez. Aceitação não basta                                                                  |
| 6. Preparação é suficiente?             | Suficiente para provas restritas; faltam motivos/respostas públicos revisados sobre detalhes pedidos. Objetivos privados do card não preenchem a lacuna                                   |
| 7. Renderer apresenta naturalmente?     | Concatena blocos íntegros e permite omissões; não costura conversa nem recebe histórico editorial recente                                                                                 |
| 8. A 5.6.2 limita expressão?            | Deliberadamente impede prosa material nova. A pobreza do repertório e a linguagem de auditoria não são invariantes obrigatórios da fronteira                                              |
| 9. O que conteúdo novo pode resolver?   | Vocabulário público mais natural, vozes e respostas pertinentes, em nova versão revisada. Sinônimos sem desenvolvimento não bastam                                                        |
| 10. O que exige arquitetura?            | Histórico editorial G4, proveniência/evento-base G5, eventual composição G3 e projeções rastreáveis G6; cada qual em escopo próprio                                                       |

As três prioridades do operador aparecem em evidências concretas:
VOICE_PROFILE_COLLAPSE; B.1/NAR-07 com linguagem de confirmação; NAR-12 com apenas
duas respostas. A pertinência ruim do seletor roteirizado não foi atribuída ao
Gemini, assim como presença de memória não foi confundida com qualidade literária.

## I. Alternativas G3/G4/G5/G6

[Análise completa por alternativa](../ai/phase-5.6.3c-literary-evaluation.md#alternativas-técnicas-para-decisão-futura):
problema, evidência, mudança, impacto esperado, risco, dependências, testes e
isolamento. Nenhuma foi implementada.

Prioridade proposta: conteúdo G1/G2 em versão nova e exposição/proveniência G5;
depois G4 com repertório suficiente; G3 para composição/omissão; G6 por último,
pela sensibilidade ao escopo mecânico. G4 sozinho não dá novas razões ao NPC.
G5 não pode apagar memória ou converter HEARD em vivência pessoal. G3 não pode
somar alternativas para alterar sentido. G6 não pode trocar “não identificou”
por “não existe”. Todos conservam catálogo recomposto e comparação integral.

## J. Plano real futuro, sem execução

[Plano JSON exato C.1](../ai/phase-5.6.3c-1-live-plan.json), status
PREPARED_NOT_AUTHORIZED_NOT_EXECUTED. Inclui seis pares de TurnRequest congelados,
gabaritos separados, catálogo, fontes/estados e hashes de produção/fixture.

| Casos  | Sequência                     | Pedidos originais da fixture    |
| ------ | ----------------------------- | ------------------------------- |
| C1-1–3 | Conflito REGULAR, 3 turnos    | NAR-03-t1/t2/t3                 |
| C1-4–5 | Promessa Story Card, 2 turnos | NAR-07-t1/t2                    |
| C1-6   | Contraparte WARM de C1-1      | NAR-08-t2, mesma pergunta exata |

Teto proposto: **12 requisições**, 6 PROPOSE de até 700 + 6 NARRATE de até 1.200,
**11.400 tokens máximos de saída configurados**. Entrada/total/latência/modelo
serão registrados pelo uso real informado, nunca deduzidos de caracteres. Configuração
local lida sem segredos: Gemini, gemini-3.5-flash-lite, fallback false e confirmação
gratuita permanente false. Isso não atesta o estado financeiro da conta.

Não enviar gabaritos/rubrica ao modelo. Comparar intenção, expressão, alvo e par
exatos; não exigir wording idêntico da descrição. Uma divergência PROPOSE reprova
o caso e economiza sua NARRATE, sem corrigir proposta nem reaproveitar a vaga.
Caso independente restante só segue dentro da mesma rodada expressamente aprovada;
erro crítico encerra tudo. Separar raw JSON, saída montada do grafo, autorização
NestJS, texto autorizado e avaliação humana. Fallback não vira acerto.

Sem retries, fallback de provedor, reparo LLM, troca de modelo ou escrita em banco.
Parar em autenticação, 429, cobrança/incerteza financeira, modelo inesperado,
falha estrutural crítica, vazamento, drift de hash ou risco de efeito real.
Exigir nova autorização do operador e confirmação da chave gratuita/billing
desativado. Não há confirmação permanente nem reaproveitamento de permissão antiga.

Limitação: três turnos e dois turnos não medem conversa longa, campanha completa
ou memória dinâmica de respostas do modelo. A projeção NARRATE atual não possui
histórico recente; não inserir G4 escondido no experimento. O futuro executor
precisa primeiro de captura de JSON bruto e orçamento global testados. A interface
entregue agora apenas prepara/valida arquivos offline e recusa flags live.

## K. Testes e preservação

TEST-LITC0-001 cobre matriz/catálogos/saídas; 002, campos de voz; 003, genérico
apesar de conteúdo; 004, proveniência insuficiente; 005, galeria recusada.
O avaliador Python protege métricas, origens, completude, mensagens congeladas,
gates eliminatórios e escrita exclusiva. Os 12 requests propostos atravessam o
grafo de produção com ScriptedProvider no teste, com conexões externas bloqueadas.

| Execução efetiva                                                 | Resultado                                                        |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| NestJS dirigido: 6 suítes, incluindo integrações PG/HTTP/FastAPI | **103/103**, 86,715 s, exit 0                                    |
| Avaliadores/contratos/grafo Python dirigidos: 6 arquivos         | **39/39**, 2,30 s, exit 0                                        |
| Cobertura do novo avaliador Python                               | **97%**, 136 statements; escopo do módulo, não global            |
| Contratos compartilhados existentes                              | **15/15**, exit 0                                                |
| Builds API/shared/Python                                         | Passaram                                                         |
| Typecheck e lint do workspace                                    | Passaram                                                         |
| Formatação do recorte / git diff --check                         | Verificação final registrada nos recibos                         |
| Formatação global                                                | Pendência dos 19 JSONs históricos preservados; sem ignores novos |

Não foi reexecutada a suíte global 509 + novos testes nem a web nesta fase; não
se afirma aprovação consolidada nova. A execução dirigida contém as 17 integrações
Story Card, 11 canônicas e as unidades de 5.6.2/G1/G2/identidade, além do replay novo.
Verifica sigilo individual, revalidação, atribuição, idempotência, rollback e a
galeria original fora do chat/memória/histórico/progresso.

Reprodução a partir da raiz, PATH contendo `.tools/node_modules/.bin`:

```sh
node scripts/test-integration.mjs --runTestsByPath test/literary-evaluation.spec.ts test/phase562-publication.spec.ts test/dialogue-content.spec.ts test/story-card-dialogue.spec.ts test/integration/story-card-dialogue.spec.ts test/integration/phase561-canonicity.spec.ts
node scripts/uv.mjs run python -m app.evaluation.literary_preparation --root ../.. --catalog /tmp/khaos563c0-catalogs.json --output /tmp/literary-metrics-new.json --plan-output /tmp/literary-plan-new.json
node scripts/uv.mjs run pytest tests/test_literary_preparation.py tests/test_narrative_lab.py tests/test_dialogue_comparison.py tests/test_contextual_dialogue.py tests/test_story_dialogue_bridge.py tests/test_phase562.py -q --cov=app.evaluation.literary_preparation --cov-report=term-missing
pnpm --filter @solo-rpg/shared-contracts test
pnpm --filter @solo-rpg/shared-contracts build
pnpm --filter @solo-rpg/api build
pnpm --filter @solo-rpg/ai-service build
pnpm typecheck
pnpm lint
pnpm format:check
git diff --check
```

Usar destinos novos na CLI: não sobrescreve evidências. Os hashes identificam
o replay preciso analisado. O runner cria/remove apenas PostgreSQL/container/
volume solorpg-test-*; nenhuma campanha real é criada ou consultada. A rota
FastAPI usa TestClient local e ScriptedProvider, não SDK externo. Os testes SDK
correlatos usam transportes em memória.

Uma execução Python restrita foi interrompida após 12 testes, sem diagnóstico
detalhado do restante; não foi contada como aprovada. Com execução local permitida,
o mesmo teste do grafo passou e a rodada dirigida final passou integralmente.
Correções intermediárias ficaram somente no avaliador/testes: formatação, anotação
de tipo e projeção dos requests futuros para conter exatamente os campos públicos
do speaker. Não se mudou uma expectativa histórica ou política de produção.

[Recibos de comandos](../ai/phase-5.6.3c-0-test-receipts.json) e
[sumário de preservação](../ai/phase-5.6.3c-0-validation-summary.json) registram saídas,
exit codes, hashes, arquivos e a pendência de formatação. Código de produção,
contratos compartilhados, provedores/modelos/fallback, .env, definições/digests,
Director, regras Blue Rose, PDFs e todas as evidências anteriores foram preservados.
Da fotografia inicial de 432 arquivos, 431 permanecem byte a byte iguais.
O inventário inicial completo estava em /tmp e não sobreviveu à pausa do ambiente;
o resultado dessa comparação foi registrado antes dela. Os recibos permanentes de
testes foram preservados. Os 18 hashes de produção/fixture do plano continuam
conferidos, e o sumário inclui uma fotografia final dos arquivos preexistentes;
essa fotografia final, não se alega reconstruir o inventário inicial perdido.

Somente o índice corrente de testes recebeu um acréscimo; os demais arquivos desta
entrega são novos e restritos a avaliação, fixture e documentação.

## L. Decisão e recomendação

A C.0 entrega diagnóstico verificável, matriz/sequências, métricas, rubrica e
plano limitado. Não certifica a qualidade literária ou escolha neural do Gemini.
Nenhum defeito crítico novo foi identificado pelas provas executadas; os limites
de seleção/pertinência são explícitos, não uma garantia semântica universal.

Recomenda-se revisão do operador das três evidências prioritárias e da rubrica.
Após essa revisão, preparar o executor limitado C.1 e seu dry-run, então solicitar
autorização específica para a amostra real proposta. Só decidir intervenções
editoriais/arquiteturais com base nos resultados separados de conteúdo e seleção.
Não iniciar automaticamente C.1, G3/G4/G5/G6, 5.7 ou 5.8.
