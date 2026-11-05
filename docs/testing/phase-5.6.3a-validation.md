# KHAOS — Fase 5.6.3A: experiência narrativa e laboratório multiturmo

02/11/2026. **Diagnóstico e laboratório offline concluídos. Qualidade literária
real do Gemini não certificada.** Zero chamadas Gemini/Groq, nenhuma mudança de
produção ou da fronteira 5.6.2. A 5.6.3B não foi iniciada.

O pedido do operador nesta etapa autorizou iniciar 5.6.3A após a
[aprovação dirigida da 5.6.1.2](phase-5.6.1.2-validation.md). As limitações dos
relatórios 5.4/5.6/5.6.2 foram consideradas; amostras antigas de prosa livre não
certificam a arquitetura posterior de fragmentos. Não se reutilizou orçamento real.

## A. Estado atual da arquitetura narrativa

Foram consultados documento-base, ADRs 0005/0007/0010/0011, arquitetura de
oficialização, renderer, memória, campanhas/sessões, Director, fronteiras de
conteúdo e documentação da adaptação/estrutura de Gloamhale. A identidade de um
Story Card de referência é separada do estado e da memória da instância.

O percurso real é: mensagem → PROPOSE → projeção de seleção → validação NestJS →
motor/commit → contexto autorizado NARRATE → escolha/ordem dos beats → validação
integral recomposta na transação → memória da réplica + mensagem persistida.
Somente o texto confirmado/persistido chega ao chat. O modelo não administra o
banco, não resolve dados e não extrai fatos canônicos da própria prosa.

### Origem, autoria e disponibilização dos fragmentos

| Fragmento/caminho               | Quem escreve                                                                                        | Como chega à Una e ao chat                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| RESULT                          | Projeção do motor/política NestJS; textos de resultado de opções são preparados pelo autor/operador | confirmed.narrative; literal obrigatório uma vez em MECHANIC                                    |
| ATMOSPHERE da cena              | Autoria da aventura ou opening da preparação local                                                  | snapshot.scene → rendering.scene → catálogo, texto integral                                     |
| ATMOSPHERE de objetos           | Descrição pública preparada/versionada ou WORLD_UPSERT local                                        | Objetos acessíveis de snapshot.world; até 20 descrições, sem inferência de pistas               |
| Abertura DIALOGUE               | Strings fixas escritas pelo desenvolvedor em publicationChoices                                     | Uma de três aberturas por categoria ampla de personalidade                                      |
| Outras falas DIALOGUE genéricas | Duas strings fixas de dúvida/esclarecimento                                                         | Disponíveis a todos os NPCs, com nome e speakerId atribuídos                                    |
| Memória DIALOGUE                | Descrição de evento confirmado, incluindo falas publicadas                                          | Conhecimento próprio do interlocutor, integralmente citado; preâmbulo WITNESSED/HEARD/RUMOR     |
| QUESTION                        | Duas strings fixas do servidor                                                                      | “O que você deseja fazer?” e “Como deseja prosseguir?”                                          |
| QUERY/OBSERVE/OOC               | Fontes autorizadas montadas pelo servidor                                                           | Sem reescrita literária; grafo devolve confirmed sem chamar gerador NARRATE                     |
| THINK/CLARIFY/ADJUDICATE        | Política determinística                                                                             | Texto de esclarecimento/limite; sem improvisação literária                                      |
| Fallback                        | Servidor                                                                                            | Resultado oficial em mecânica; primeira réplica segura disponível em diálogo; motivo preservado |

Fontes executáveis principais:
[catálogo/validador](../../apps/api/src/narrative/rendering.ts),
[contexto](../../apps/api/src/narrative/context.service.ts),
[resolução e memória de fala](../../apps/api/src/narrative/resolution.service.ts),
[persistência](../../apps/api/src/narrative/narrative.service.ts),
[grafo Python](../../apps/ai-service/app/narrative/graph.py),
[prompt](../../apps/ai-service/app/narrative/prompts.py).

### Seleção, personalidade, memória e variação

Una recebe playerMessage e `rendering.publication.choices`. NARRATOR pede escolher
1–4 beats completos, sem reescrever texto, kind, speakerId ou factIds. O grafo
Python concatena os textos com duas quebras de linha. Pydantic verifica estrutura;
NestJS reconstrói o catálogo atual e autoriza a composição por correspondência integral.
IDs, rótulos e prosa convincente não concedem autorização para outra afirmação.

Personalidade influencia **somente uma abertura**: cautelosa/desconfiada/reservada,
afetuosa/acolhedora/gentil, ou categoria genérica. Restam duas falas comuns. Portanto,
há três falas sem memória por NPC em um catálogo individual, não três vozes completas.
O teste de controle muda speech, motivations e state mantendo personality: o catálogo
permanece igual. Esses campos chegam ao contexto, mas não geram novas strings no
catálogo. O modelo pode escolher entre as strings existentes; não pode expressar
livremente o estilo de fala do card. Dois NPCs da mesma categoria colapsam em voz similar.

Story Cards de Gloamhale possuem speech, history, goals, fears, secrets e relações.
No caminho de cast individual, rendering recebe identidade pública, estado e memória
própria. History/goals/secrets do card não viram fatos públicos por estarem preparados.
Companheiros usam o caminho de personagens; speech é string vazia nesse recorte.
O laboratório usa NPCs sintéticos, não importa nem pontua os cards reais de Gloamhale.

Memória altera o conjunto de citações possíveis. `rememberReply` e `remember`
registram fala atribuída e conhecimento HEARD dos presentes, com importância 90.
O conteúdo comprova que a fala ocorreu, não que seu teor seja verdadeiro. Todas as
memórias críticas próprias são preservadas; não há estado emocional livre inferido.
Uma réplica que cita uma memória pode ser gravada e citada novamente. O laboratório
mostra essa cadeia, com camadas de `>` e linguagem de auditoria dentro da conversa.

Relações, estilo, motivação, estado e fala podem orientar a escolha do modelo, mas
não ampliam o texto permitido pelo catálogo. A variação atual vem da ordenação,
combinação/omissão de beats opcionais, fontes preparadas e citações. A mesma string
não pode repetir dentro de uma resposta; não há prevenção de repetição entre turnos.
Limites de 3.000 caracteres por beat/12.000 na mensagem preservam transporte; uma
fonte longa demais fica fora do catálogo, sem ser truncada para parecer citação inteira.

### Restrições de segurança que precisam permanecer

Resultado oficial literal, proveniência, acesso individual, modalidade dos relatos,
exclusão de segredos, identidade do interlocutor, agência de Naelis, revalidação
transacional, idempotência e publicação somente após validação são essenciais.
O catálogo pequeno, os três textos de diálogo, a pergunta final recorrente e a
falta de contexto editorial recente são escolhas de implementação passíveis de
melhoria. Não é necessário remover a verificação integral para ampliar a autoria.

O [Director](../architecture/campaign-director.md) controla progresso por evidências,
nunca por número de turnos, tempo real ou exigência de reviravolta. A falta de ritmo
literário não autoriza completar objetivos ou encerrar cenas automaticamente.

## B. Matriz de cenários multiturmo

Uma [fixture declarativa](../../apps/api/test/fixtures/narrative-lab.json) prepara
mensagens, expressão comunicativa, NPCs e mundo. O
[laboratório de integração](../../apps/api/test/integration/phase563a-lab.spec.ts)
usa HTTP/NestJS, grafo Python de produção via ScriptedProvider, motor real com dado
fixo e PostgreSQL descartável. O cliente externo de IA é substituído. Não se exercitam
SDK/roteador real, classificação do português por Gemini ou navegador nesta etapa.

| ID      | Sequência por execução                                                                                                           | Turnos | Evidência principal                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- | -----: | ----------------------------------------------------------------------------------- |
| 563A-01 | Pedir conversa → opinião → esclarecimento → insistir em continuar → perguntar por divergência                                    |      5 | Sustentação de diálogo; sem conclusão automática da sessão                          |
| 563A-02 | Expressar mágoa → negar acordo → perguntar pelo desacordo → negar perdão                                                         |      4 | Memória própria preparada, sem reconciliação nem delta de relação                   |
| 563A-03 | Observar estante → procurar passagem → investigar chão sem política → teste fracassado com injeção da galeria → observar de novo |      5 | Observação ≠ descoberta; adjudicação; galeria bloqueada e fallback literal          |
| 563A-04 | Falar com Iria → teste fracassado → comentar fracasso → teste bem-sucedido → decidir depois                                      |      5 | Dois resultados oficiais, atmosfera, réplica e agência preservados                  |
| 563A-05 | Duas falas a Iria na sessão 1 → perguntar à Tessa na sessão 2 → retomar memória com Iria → continuar sem presumir acordo         |      5 | Chat antigo intacto, memória individual e ausência inicial do conhecimento em Tessa |
| 563A-06 | Conversa → regra OOC → retorno ao RPG → observação → diálogo                                                                     |      5 | OOC sem eventos/rolagens; retorno à mesma cena e interlocutora                      |

Cada cenário roda com **FIRST** e **VARIED**: 12 sequências, **58 turnos**. FIRST
sempre escolhe a primeira fala genérica; VARIED alterna as três falas e as duas
perguntas, preferindo uma citação que contenha a memória preparada quando houver.
Essa preferência deliberadamente simples pode citar uma réplica que já citou a
memória. Nenhum dos dois é apresentado como seletor ótimo ou comportamento Gemini.

Ambos adicionam a primeira atmosfera disponível e uma pergunta final quando o
catálogo permite. **Essa repetição é induzida pelo seletor de teste, não exigida pela
política**: o catálogo/prompt atual permitem omitir esses beats. O experimento
isola a sensibilidade à seleção e o teto de variedade das opções utilizadas.

O teste de sucesso/fracasso usa dificuldades sintéticas explicitamente preparadas
antes de cada tentativa. Isso não é variação de dificuldade decidida pela narração.
O selo azul é a única descoberta autorizada; nenhuma passagem existe nesta fixture.
O teste adversarial acrescenta a mesma galeria da regressão original ao rascunho;
ela é recusada antes de publicar.

Na continuidade, Tessa só entra na segunda sessão e é perguntada antes de ouvir
Iria recitar a lembrança. Não recebe testemunho ocular retroativo. Ouvir uma citação
posterior seria transmissão HEARD legítima. O lifecycle usa campanha legada sintética
para atravessar duas sessões sem editar/importar aventuras; o Director novo é
auditado e protegido pelos testes existentes, não certificado por esse atalho legado.

## C. Rubrica de avaliação

A [rubrica versionada](../ai/phase-5.6.3a-rubric.json) define todos os níveis 1–5
para dez critérios, sem média automática. Evidências: ID de turno, mensagem,
texto efetivamente publicado, fontes/resultado autorizado, estado antes/depois e
justificativa do revisor. Critério sem objeto no cenário é N/A, não nota artificial.

| Critério            | 1                                        | 3                                        | 5                                                      |
| ------------------- | ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------ |
| Naturalidade        | Fórmula sem resposta contextual          | Compreensível com transições artificiais | Conversa fluida e sensível às nuances                  |
| Coerência narrativa | Sequência desconexa                      | Consistência com ligações parciais       | Cada turno desenvolve organicamente a cena             |
| Personalidade       | Vozes indistinguíveis                    | Voz/motivação reconhecíveis em parte     | Voz própria e nuances sustentadas                      |
| Continuidade        | Ignora passado/contexto                  | Recupera referência, pouco integra       | Integra memória e tom entre sessões                    |
| Prosa               | Texto técnico domina                     | Atmosfera e passagens mecânicas          | Prosa literária consistente e fundamentada             |
| Variedade           | Mesmas frases dominam                    | Variação contextual parcial              | Diversidade pertinente e sustentada                    |
| Ritmo               | Estagna/encerra artificialmente          | Avanço com pausas mecânicas              | Cadência contextual sem avanço forçado                 |
| Pertinência         | Não responde ao ato específico           | Atende parte da intenção                 | Responde ao ato inteiro dentro das fontes              |
| Imersão             | Artificialidade/exposição técnica domina | Cena clara com interrupções              | Presença ficcional sustentada                          |
| Agência de Naelis   | Inventa ação/fala/decisão                | Preserva decisão, conduz demais          | Mantém escolhas e sentimentos sob controle da jogadora |

Os níveis 2 e 4 estão descritos individualmente no JSON. Notas são revisão editorial
do agente sobre textos roteirizados publicados, não avaliação humana aprovada ou
acurácia/qualidade do Gemini. O analisador automático só conta repetição e reúne
evidências; seu campo `automaticLiteraryScores` permanece null.

**Eliminatórios independentes:** descoberta não autorizada; contradição do resultado
mecânico; segredo divulgado; ação/fala/pensamento/sentimento voluntário de Naelis
inventado; estado/relacionamento alterado sem autorização; contradição de fatos
oficiais preparados. Uma ocorrência comprovada reprova, ainda que todas as notas
literárias sejam 5. O gate consome achados de testes/revisão explícitos; não é um
oráculo de verdade semântica. Os controles negativos cobrem seis exemplos limitados.

## D. Resultados offline

As 12 sequências passaram nos invariantes verificados. Mundo, inventário, Saúde e
relações permaneceram iguais; progressão sem avanço indevido; rolagens ocorreram
somente nos testes preparados; conversas não encerraram sessões automaticamente.
Os dois ataques à publicação da galeria foram bloqueados e publicaram o fracasso
literal. Nenhuma divulgação de segredo ou ação nova de Naelis foi observada no
texto revisado. Isso não certifica toda a semântica possível da aventura real.

| Cenário | Respostas adjacentes idênticas FIRST → VARIED | Parágrafos repetidos/ocorrências FIRST → VARIED | Achado                                                                  |
| ------- | --------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| 01      | 4 → 0                                         | 12/15 → 9/15                                    | Cinco respostas completas distintas ainda reciclam os mesmos fragmentos |
| 02      | 3 → 0                                         | 9/12 → 6/16                                     | Citação aninhada cresce; tensão não vira reconciliação                  |
| 03      | 1 → 1                                         | 2/5 → 2/5                                       | Observação literal e adjudicação técnica; fallback seguro               |
| 04      | 0 → 0                                         | 10/15 → 7/15                                    | Resultado muda; atmosfera e convites permanecem iguais                  |
| 05      | 2 → 0                                         | 11/15 → 9/19                                    | Memória entre sessões existe; exposição segue artificial                |
| 06      | 0 → 0                                         | 6/11 → 4/11                                     | OOC correto; retorno não retoma o conteúdo da conversa                  |
| Total   | **10 → 1**                                    | **50/73 → 37/81**                               | Alternância reduz cópia, sem demonstrar conversa natural                |

“Parágrafos repetidos” conta ocorrências além da primeira dentro da mesma execução;
não mede variedade lexical geral, semântica ou porcentagem de qualidade. Os dois
seletores publicaram 22 perguntas finais cada, em 29 turnos. A pergunta de dúvida
dentro de DIALOGUE é separada da pergunta QUESTION adicionada ao final.

### Notas editoriais do seletor VARIED, sem média

NAT=naturalidade; COE=coerência; PER=personalidade; CON=continuidade; PRO=prosa;
VAR=variedade; RIT=ritmo; PERT=pertinência; IME=imersão; AGE=agência.

| Cenário | NAT | COE | PER | CON | PRO | VAR | RIT | PERT | IME | AGE |
| ------- | --: | --: | --: | --: | --: | --: | --: | ---: | --: | --: |
| 01      |   2 |   2 |   2 |   2 |   2 |   2 |   2 |    1 |   2 |   5 |
| 02      |   1 |   2 |   2 |   3 |   1 |   2 |   1 |    2 |   1 |   5 |
| 03      |   2 |   3 | N/A |   3 |   1 |   1 |   2 |    3 |   1 |   5 |
| 04      |   2 |   3 |   2 |   3 |   2 |   2 |   2 |    3 |   2 |   5 |
| 05      |   1 |   3 |   2 |   3 |   1 |   2 |   1 |    2 |   1 |   5 |
| 06      |   2 |   3 |   2 |   3 |   2 |   2 |   2 |    2 |   2 |   5 |

[Revisão editorial completa](../ai/phase-5.6.3a-editorial-review.json): cada nota
inclui justificativa, IDs de turnos e excerto identificado. Personalidade é N/A no
03 por não haver turno de NPC. Agência alta não compensa prosa fraca nem dispensaria
um eliminatório. Os controles canônicos passaram no escopo declarado.

### Evidências textuais representativas

- **563A-01-VARIED-t2:** “Quero ouvir sua opinião sobre o nosso desacordo.” recebe
  “Iria — Ainda preciso de razões para acreditar. O que sustenta essa suspeita?”.
  A fala é autorizada, mas não oferece a opinião pedida.
- **563A-02-VARIED-t4:** após “Não disse que perdoei você”, surge novamente
  “Prefiro cautela”, seguido de uma citação de réplica que cita outra réplica e a
  memória original. Não há perdão inventado; há pouca continuidade emocional expressa.
- **563A-03-VARIED-t2/t3:** intenções diferentes recebem a mesma adjudicação que
  inclui “Nenhum efeito foi aplicado”. É um limite técnico deliberado, não erro de geração.
- **563A-04-VARIED-t4/t5:** o motor confirma o selo azul, mas a fala posterior volta
  a pedir sustentação de uma suspeita. Não cria efeito adicional; a ligação dramática é fraca.
- **563A-05-VARIED-t3/t4:** Tessa não recebe a lembrança que não presenciou; Iria a
  recupera na sessão 2. Acesso está correto, mas a referência vem em forma de relatório.
- **563A-06-VARIED-t3:** o retorno à cena recebe “Não tenho uma resposta segura para
  isso. Pode me contar mais?”. Cena preservada, costura conversacional ausente.

Os [transcritos e catálogos por turno](../ai/phase-5.6.3a-lab-result.json) preservam
os 58 textos completos, fontes, drafts selecionados, fallback e verificações de estado.
As [métricas](../ai/phase-5.6.3a-metrics.json) usam somente texto publicado, sem contar
a galeria rejeitada como parte da experiência segura. IDs de eventos são aleatórios;
textos e invariantes, não UUIDs, são a base da reprodução.

### Execução e limites da evidência

34 testes de integração passaram em 107,013 s: 13 do laboratório, 11 de canonicidade
existente e 10 de progressão/menções 5.5. Os 13 testes do laboratório incluem 12
sequências e um controle de campos de voz/recusas. Python: 16 testes passaram em
0,39 s, incluindo 10 do analisador/CLI/gate e seis do protocolo 5.6.2; cobertura do
analisador 98%. Typecheck API, ESLint do teste, Ruff, mypy e formatação passaram.
Não foi reexecutada nem certificada aqui toda a suíte global do monorepo.

Durante a elaboração corrigiram-se o tipo local do adaptador, o tipo de evento da
memória sintética e as asserções de acesso: conhecimento da própria protagonista
pode estar em seu contexto; isso difere de divulgar ao NPC/chat. A ordem de Tessa
foi ajustada para testá-la antes de ouvir o relato. Não se relaxou uma asserção para
aceitar vazamento, nem se alterou produção para tornar o laboratório verde.

Reprodução, a partir da raiz, com PostgreSQL descartável:

```sh
PATH="$PWD/.tools/node_modules/.bin:$PATH" node scripts/test-integration.mjs --runTestsByPath test/integration/phase563a-lab.spec.ts test/integration/phase561-canonicity.spec.ts test/integration/phase55.spec.ts
node scripts/uv.mjs run python -m app.evaluation.narrative_lab --input /tmp/khaos563a-lab.json --output /tmp/khaos563a-analysis-new.json
node scripts/uv.mjs run pytest tests/test_narrative_lab.py tests/test_phase562.py -q --cov=app.evaluation.narrative_lab --cov-report=term-missing
```

O runner escreve somente o artefato temporário do laboratório em `/tmp`; a CLI cria
saída exclusivamente, recusando sobrescrever evidência existente. Use caminho de
saída novo em nova análise. Não há ferramenta de chamada externa no analisador.

Os hashes de 377 arquivos preexistentes foram comparados: 376 permaneceram iguais;
somente o índice `docs/testing/narrative-tests.md` recebeu a seção desta fase.
Arquivos novos são infraestrutura de avaliação e evidências. Código de produção,
fronteira 5.6.2, modelo/provedor/fallback, `.env`, PDFs e definições/digests das
aventuras foram preservados. O [resumo estruturado](../ai/phase-5.6.3a-validation-summary.json)
registra a comparação e os hashes dos artefatos finais.

## E. Problemas identificados e comparação com a experiência desejada

| Romance interativo desejado                   | Comportamento atual observado/possível                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| NPC responde ao que Naelis disse              | Repertório de dúvidas/esclarecimentos, sem réplicas preparadas para muitos assuntos                 |
| Voz própria por personagem                    | Uma abertura por categoria ampla; fala específica do card não entra no texto disponível             |
| Tensão tem continuidade sem perdão automático | Estado e memória preservados; tensão aparece como citação, pouco como resposta                      |
| Prosa varia com cena e ação                   | Textos preparados podem ser bons, mas o mesmo parágrafo reaparece se sempre selecionado             |
| Resultado mecânico integra-se ao diálogo      | RESULT é correto; conexão com a fala seguinte depende de fragmentos pertinentes que hoje faltam     |
| Conversa prossegue sem “reset” a cada turno   | Pergunta final e pedido de esclarecimento podem se acumular                                         |
| Memória reaparece de modo legível e atribuído | Origem é preservada, mas citação literal pode transportar linguagem de auditoria e ecoar a si mesma |
| Naelis conserva suas escolhas                 | Preservado no laboratório; não precisa ser sacrificado para melhorar prosa                          |

O laboratório não prova que o Gemini escolheria os mesmos fragmentos. Também não
representa todos os textos preparados de Gloamhale. Ele demonstra comportamentos
reproduzíveis permitidos pela arquitetura e limites independentes do modelo.

## F. Diagnóstico das causas por responsabilidade

| Classe                    | Causa sustentada por evidência                                                                                                   | Limite da conclusão                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A. Conteúdo preparado     | Três falas genéricas por NPC; faltam réplicas específicas e formulações públicas de memória menos burocráticas                   | Autoria mais rica pode ajudar; não se mede aqui o corpus inteiro da aventura                             |
| B. Seleção pelo modelo    | FIRST/VARIED mudam repetição sem mudar a fronteira; omitir atmosfera/QUESTION já é permitido                                     | Seletores são scripts; nenhum defeito de seleção do Gemini foi medido                                    |
| C. Contratos de geração   | Beats expressam tipo/texto/fontes, sem ato de diálogo, tópico ou continuidade editorial explícitos; prompt pede 1–4              | O contrato não obriga um fecho por turno; instrução/prompt real pode selecionar melhor                   |
| D. Renderer               | Python concatena blocos; NestJS exige pelo menos uma fala em DIALOGUE, não resposta pertinente                                   | Coesão/pertinência não são provadas pela correspondência integral                                        |
| E. Memória/contexto       | Falas e réplicas HEARD críticas tornam-se candidatas a novas citações; não há recorte editorial de histórico recente no renderer | Memória não foi perdida; preservação integral não equivale a boa exposição                               |
| F. Política de publicação | Sem reescrita: não se pode criar gesto, metáfora, resposta ou fato fora das fontes autorizadas                                   | Restrição essencial contra fatos inventados; tamanho/qualidade do catálogo não são invariantes imutáveis |

O maior request NARRATE observado tem cerca de 10 mil caracteres. Isso é uma
medida de serialização, não tokens ou custo Gemini. O grafo com ScriptedProvider
não exercita o limite do roteador real. A persistência de memória crítica exige
observar crescimento em sequências maiores antes de concluir sobre escalabilidade.

## G. Alternativas de melhoria

Todas são propostas para decisão futura. Nenhuma foi implementada nesta fase.

| Alternativa                                                | Benefício                                                                      | Python                                                           | NestJS                                                                                       | Contratos                                                                                     | Inferência adicional                                     | Testes/compatibilidade 5.6.2                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| G1. Biblioteca de variantes de voz revisadas               | Diferenciar acolhimento, cautela, reserva e formas de pergunta sem novos fatos | Selecionar variantes do catálogo existente                       | Autoria e seleção de fragmentos por voz/ato                                                  | Pode manter NarrativeBeat; metadados de autoria internos                                      | Zero chamadas extras; catálogo maior pode elevar entrada | Mesmo verificador integral; testar identidades, variantes e ausência de alegações novas                                    |
| G2. Réplicas preparadas por assunto e conhecimento próprio | Responder substantivamente dentro do que o NPC pode saber                      | Seleção de réplicas autorizadas, sem redigir informação nova     | Disponibilizar apenas respostas cujas condições/fatos e acesso estejam satisfeitos           | Contexto pode ganhar chaves de tópico/ato; seletor novo requer espelhos se entrar na proposta | Zero chamadas extras no desenho mínimo                   | Negativos para tópico sem fonte, conhecimento alheio, segredo e fato desatualizado                                         |
| G3. Composição editorial contextual de beats               | Melhorar encadeamento, integrar resultado/atmosfera e evitar fecho duplo       | Orientar ordem e omissão dentro de padrões revisados             | Formar opções/padrões com os mesmos fragmentos autorizados                                   | Pode manter beats atuais; contexto editorial aditivo                                          | Zero chamadas extras                                     | RESULT continua literal; testar sucesso/fracasso, ordem, falta de resposta e agência                                       |
| G4. Histórico curto de fragmentos publicados               | Evitar repetir atmosfera/fecho sem perder informação pedida                    | Receber histórico editorial limitado                             | Recuperar identidade dos fragmentos anteriores, com exceções de resultado/consulta explícita | Metadados de publicação/contexto aditivos; não precisa alterar fatos canônicos                | Zero chamadas extras                                     | Testar repetição entre turnos, reinício, fallback e disponibilidade de alternativa segura                                  |
| G5. Recuperação editorial de memória com proveniência      | Evitar recitar réplicas recitando réplicas                                     | Preferir fonte pertinente, sem parafrasear nem apagar modalidade | Distinguir evento-base de registro de réplica, conservando tudo no banco e acesso individual | Metadados de evento/origem no contexto; possível índice editorial separado                    | Zero chamadas extras na filtragem determinística         | Não apagar memória crítica; não cortar citação e fingir completude; testar HEARD/RUMOR/WITNESSED e informação recém-ouvida |
| G6. Projeções públicas de resultado escritas para leitura  | Reduzir exposição técnica sem mudar a regra                                    | Continua narrando o recibo literal escolhido pelo servidor       | Templates revisados de projeção antes do commit, separados do cálculo                        | Comandos mecânicos podem permanecer iguais; fonte/projeção precisa de rastreabilidade         | Zero chamadas extras                                     | Equivalência de todos os resultados e preservação do literal; manter recibos históricos intactos                           |

“Zero chamadas extras” compara com o fluxo atual, não promete igual número de tokens.
Não se propõe juiz LLM ou geração irrestrita de prosa. Conteúdo novo não deve ser
inserido silenciosamente em definição/digest de aventura existente; uma futura
biblioteca precisa de versionamento e autoria próprios aprovados.

## H. Riscos e limitações das alternativas

- **G1:** variantes “não materiais” ainda podem prometer ajuda, perdão, afeto ou
  suspeita específicos. Revisar seu significado e condições, não apenas palavras.
  Rotular o perfil como afetuoso não autoriza mudança relacional em uma cena de conflito.
- **G2:** maior ganho de pertinência, mas risco de expor spoiler ou autorizar
  resposta baseada apenas em card privado. Condições devem usar conhecimento
  próprio atual e fontes oficiais; falta de tópico autorizado continua admitindo limite.
- **G3:** ordem e conectivos podem insinuar causalidade ou sucesso adicional.
  Padrões devem ser revisados; montagem integral não prova todo o significado da combinação.
- **G4:** deduplicação rígida pode ocultar resultado obrigatório, impedir repetir
  informação solicitada ou esgotar catálogo. Omitir só o opcional; nunca esconder
  RESULT ou recusar o único fallback seguro em nome da variedade.
- **G5:** filtrar réplicas pode apagar a única evidência de uma promessa realmente
  dita; sumarizar livremente pode promover HEARD a verdade. Preservar eventos e
  modalidade, manter acesso a citações originais e testar origem antes de priorizar.
- **G6:** mudar frase oficial pode mudar escopo de sucesso/falha. É o recorte de
  maior sensibilidade mecânica; postergar até haver casos/formatos bem delimitados.

Nenhuma alternativa fornece garantia semântica universal. Autoria errada de um
fragmento “autorizado” continua sendo um risco da preparação. Usar IDs, regex ou
um texto convincente como substituto da autorização material não é alternativa aceita.

## I. Recomendação para a 5.6.3B

Priorizar **G1+G2 em recorte pequeno**, seguidos de G3+G4: dois NPCs sintéticos com
vozes distintas, poucos assuntos factuais e atos de conversa revisados, conflito
sem reconciliação automática e dois resultados mecânicos. A entrega deve preservar
o mesmo catálogo recomposto e a comparação integral da 5.6.2. Mais sinônimos das
três perguntas atuais não bastam para pertinência.

Tratar G5 como segundo recorte, começando por selecionar o evento-base em vez da
réplica recursiva, sem excluir dados nem conceder conhecimento coletivo. Manter G6
para decisão posterior. Não começar por liberar paráfrase genérica de memórias,
gestos e fatos materiais: essa decisão reabriria o problema de canonicidade.

Aceite proposto para B: corpus versionado de fontes e condições; todos os controles
canônicos anteriores passando; ganho revisável em pertinência/vozes e redução de
repetição neste mesmo laboratório; controles sem respostas preparadas continuam
seguros; plano de implantação/rollback preserva histórico e guardas. Avaliação
real e aprovação humana permanecem necessárias para afirmar ganho do Gemini.

**A 5.6.3B não foi iniciada nem autorizada por inferência desta recomendação.**

## J. Plano de avaliação real futura — sem chamadas executadas

Uma rodada futura exige nova autorização específica, confirmação da chave gratuita
e billing desativado, modelo fixado, número de chamadas, limites e política de
interrupção explícitos. Nenhuma autorização da 5.6.1.2 é reutilizável.

Proposta de piloto: duas sequências de três turnos, diálogo e conflito, com até
12 chamadas (seis PROPOSE de até 700 tokens e seis NARRATE de até 1.200), sem retries,
fallback de provedor ou juiz extra. É proposta, não orçamento autorizado. Usar
contexto/fluxo de produção e banco sintético isolado, guardar drafts e publicações
separadamente, não enviar notas/rubrica de resposta ao modelo e parar em erro crítico.

A expansão para a matriz inteira com um seletor real corresponderia a 29 turnos,
29 PROPOSE e até 23 NARRATE geradores (52 chamadas); informação/adjudicação têm
NARRATE determinístico. Esse teto deve ser revisto antes de pedir autorização,
sem tratar contagem estimada de chamadas como custo/tokens já consumidos.

Revisores devem pontuar sequências completas, com modelo/versão/uso e sigilo
auditados. Resultados de 5.6.3A são baseline estrutural/editorial offline, não
substitutos dessa medição. Nenhum teste real, B ou Fase 5.7 foi iniciado.
