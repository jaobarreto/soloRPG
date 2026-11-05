# KHAOS — Fase 5.6.2: fronteira de publicação narrativa

**APROVADA para a fronteira determinística implementada e testada offline.**
Não certifica a interpretação neural, a campanha inteira ou literatura irrestrita.
Nenhuma tentativa Gemini; nenhuma autorização anterior foi reaproveitada.

## A. Diagnóstico e impacto

Na auditoria 5.6.1, o resultado oficial dizia “A busca não identificou nenhuma
abertura”, mas um ATMOSPHERE acrescentava “Atrás da estante há uma galeria que
conduz ao jardim”. RESULT, schema, eventos e estado estavam corretos. A regex
recusava a expressão literal, mas não a paráfrase. `accepted=true` selecionava o
draft inteiro para gravação e publicação. IDs válidos não provavam a alegação.

O fluxo auditado foi resolução/evento → commit → contexto autorizado → NARRATE →
beats → validação → transação de réplica/mensagem → HTTP/histórico/SSE. A memória
HEARD já distinguia fala de verdade; faltava impedir o narrador de acrescentar
material não autorizado antes de publicar.

A estratégia foi apresentada antes de implementar: usar os beats existentes como
seleção por correspondência integral de fragmentos autorizados. Mudanças de produção
limitadas a `rendering.ts`, `context.service.ts`, `narrative.service.ts` e ao prompt
NARRATE de produção. Não houve mudança de schema, PROPOSE, seleção de ferramenta,
Game Engine, Director, efeitos, regras, banco ou definições da aventura. Nenhum
agente juiz ou serviço novo. O amplo diff preexistente do workspace não representa
esta fase.

## B. Arquitetura e garantia

O NestJS oferece `rendering.publication = {version: 1, choices: [...]}` dentro do
contexto extensível existente. O catálogo inclui o resultado literal do motor,
descrições públicas acessíveis, convites aprovados e falas do interlocutor.
Personalidade escolhe entre vozes revistas; conteúdo de memória própria é citado
integralmente em fala atribuída, com modalidade WITNESSED/HEARD/RUMOR preservada.

O modelo pode escolher e ordenar fragmentos, sem reescrevê-los. O validador refaz o
catálogo com o estado atual na transação, compara texto, tipo, interlocutor e IDs,
confere resultado/eventos e monta uma nova narração usando as strings do servidor.
Não confia em catálogo ecoado ou em uma classificação ATMOSPHERE do gerador.
A mensagem final usa `validation.narration`, não a saída crua aprovada por um booleano.

Recusa mecânica publica o resultado confirmado sem novo teste ou CLARIFY. Recusa
literária de diálogo publica uma alternativa atribuída segura e registra a recusa.
A alternativa tem memória HEARD porque foi de fato publicada; a frase rejeitada não
é lembrada. Também uma resposta de diálogo sem réplica usa MISSING_REPLY/fallback,
para não esconder a ausência de resposta do gerador. Evento, memória e mensagem
continuam atômicos. O prompt orienta o protocolo; a garantia está no servidor.

[Renderer e limites](../ai/narrative-renderer.md),
[ADR 0011](../adr/0011-publicacao-narrativa-por-fragmentos-autorizados.md).

## C. Reprodução e matriz obrigatória

O teste original da galeria mantém a mesma frase, fixture, resultado fracassado e
expectativas: publicar somente o fracasso e `injectedVisible=false`. Não foi
invertido, omitido ou marcado skip. Os resultados antigos da 5.6.1 foram preservados.

| TEST-ID        | Evidência executável                                                                                             | Resultado                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| TEST-CANON-001 | `phase562-publication.spec.ts`: “existe uma passagem secreta”; integração original com “há uma passagem secreta” | Acréscimo recusado; resultado e evento oficiais preservados.                                                   |
| TEST-CANON-002 | Regressão B/paraphrased secret em `phase561-canonicity.spec.ts`, com grafo Python real e banco descartável       | Galeria não publicada; UNAPPROVED_SEGMENT e fallback.                                                          |
| TEST-CANON-003 | Seis formulações: corredor, escadaria, entrada oculta, compartimento, caminho subterrâneo, sala adicional        | Todas recusadas por ausência no catálogo; sem lista de palavras proibidas.                                     |
| TEST-CANON-004 | ID válido da estante acompanha acusação de culpa                                                                 | Recusada; IDs e rótulos não autorizam texto diferente da fonte.                                                |
| TEST-CANON-005 | Controle B positivo com teste preparado bem-sucedido                                                             | Descoberta literal publicada; evento e conhecimento WITNESSED preservados.                                     |
| TEST-CANON-006 | Unidade e integração com resultado + luz/verniz preparados + pergunta                                            | Composição expressiva publicada, sem fallback nem descoberta adicional.                                        |
| TEST-CANON-007 | NPC cauteloso, memória própria de discussão, segredo apenas da protagonista e notas privadas excluídos           | Fala atribuída, memória HEARD da réplica, sem alteração de mundo, Saúde, progresso ou dados.                   |
| TEST-CANON-008 | Rumor autorizado ao NPC e unidade para RUMOR/HEARD/WITNESSED                                                     | Atribuição e incerteza conservadas. Paráfrase afirmando culpa é recusada mesmo com ID válido.                  |
| TEST-CANON-009 | Fracasso versus alegação de acesso ao jardim ou “a procura deu frutos”                                           | Sucesso adicional recusado; fracasso mantido.                                                                  |
| TEST-CANON-010 | A/C/D originais: ausência, indefinição e quatro tentativas, incluindo empurrar estante                           | Sem descoberta por repetição, dificuldade inventada, dano, punição, mapa ou progresso novo.                    |
| TEST-CANON-011 | Falha de geração; trigger que rejeita persistência; retry concluído; regressão transacional de diálogo           | COMMITTED recuperável, sem repetir dados/consequências/descobertas. Memória de réplica reverte com a mensagem. |
| TEST-CANON-012 | HTTP de ação/rolagem, SSE, histórico e SELECT da mensagem após acréscimos rejeitados                             | Nenhum canal contém o acréscimo. SSE transmite snapshot persistido, sem tokens intermediários.                 |

Saída pública efetivamente obtida após fracasso e tentativa de injetar a galeria:

> A busca não identificou nenhuma abertura.

Controle positivo de descoberta:

> Um painel atrás da estante conduz à galeria do jardim.

[Dados estruturados da execução](../ai/phase-5.6.2-canonicity-audit.json), incluindo
respostas públicas, eventos, estado, variantes e recuperação. As fontes e textos
adversariais são fixtures; não são novas gerações Gemini.

## D. Controles positivos e regressões

A integração positiva de atmosfera publicou exatamente:

> A busca não identificou nenhuma abertura.
>
> A luz dourada repousa nas lombadas gastas; a madeira conserva o brilho do verniz.
>
> Como deseja prosseguir?

O NPC continuou respondendo sem opção de cena: “Mira — Prefiro cautela. O que
despertou sua suspeita?”, seguido da memória própria atribuída. Para rumor, publicou
“Mira — Ouvi este rumor, mas não posso confirmá-lo”, seguido da citação autorizada.
A passagem pode existir como **rumor conhecido pelo NPC** sem passar a existir no
mapa ou ser registrada como descoberta verdadeira.

A suíte completa mantém as regressões de 5.3–5.6.1: duas sessões, conhecimento
individual, conflitos críticos, sigilo, ferramentas, contratos, menções, progressão,
resultado literal, fallback, memória e idempotência. Os testes que antes aceitavam
prosa arbitrária de diálogo foram migrados para o catálogo. O teste da réplica
rejeitada agora verifica uma memória da alternativa segura efetivamente publicada;
continua proibindo a espada/decisão inventada. Não enfraquecemos a regressão crítica.

## E. Compatibilidade e recuperação

Schemas de beats Python/Zod, geração const→enum, esquema de banco, recibos e
históricos permanecem inalterados. Há teste offline que serializa o catálogo em
Pydantic e valida de volta em Zod, incluindo todos os tipos e narração legada;
campos extras e discriminador ADMIN continuam recusados. As 109 propostas da
matriz anterior e os negativos históricos também continuam na suíte completa.

Implantar primeiro API corrigida; depois o prompt Python que seleciona o catálogo.
Python anterior contra API nova recebe fallback quando necessário, sem exposição
da prosa não aprovada. Para reverter Python, manter API corrigida. Não é seguro
reverter a fronteira para a API vulnerável: conservar o patch no artefato anterior
ou suspender geração até um artefato seguro. Não há comando operacional de rollback
verificado neste ambiente; nenhum comando fictício ou migration destrutiva foi criado.
Drenar leases, preservar volumes e retomar COMMITTED sem repetir o motor.

Nenhuma campanha real foi escrita. O runner utiliza PostgreSQL com marcador
`solorpg-test-*` e banco `/solorpg_test`, removendo só seu container/volume. A fixture
recusa outro destino. Históricos antigos não são apagados, corrigidos ou certificados
retroativamente.

## F. Verificação reproduzível e métricas

Comandos efetivamente usados na raiz, sem confirmação financeira temporária:

```sh
PATH="$PWD/.tools/node_modules/.bin:$PATH" node scripts/test-integration.mjs --coverage
node scripts/uv.mjs run pytest --cov=app --cov-report=term-missing
.tools/node_modules/.bin/pnpm --filter @solo-rpg/shared-contracts test
.tools/node_modules/.bin/pnpm --filter @solo-rpg/api typecheck
.tools/node_modules/.bin/pnpm --filter @solo-rpg/api build
.tools/node_modules/.bin/pnpm --filter @solo-rpg/shared-contracts typecheck
node scripts/uv.mjs run mypy app
```

| Verificação final          | Resultado                                                                               | Cobertura                                                         |
| -------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| NestJS completo, 29 suítes | 383 aprovados, 0 falhas; 93,928 s                                                       | 93,83% linhas; 92,39% statements; 84,21% branches; 96,48% funções |
| Renderer                   | Exercitado pela suíte completa                                                          | 98,76% linhas; 97,89% statements; 95,95% branches; 100% funções   |
| Python completo            | 329 aprovados, 0 falhas; 8,26 s                                                         | 87% global, arredondado pelo coverage                             |
| Contratos compartilhados   | 4 arquivos de teste aprovados                                                           | Sem alteração dos contratos                                       |
| Recorte de publicação      | 22 testes de unidade/contrato; 11 de integração; 6 Python de protocolo, incluídos acima | Sem skip da regressão                                             |

As métricas finais e checks de preservação estão no
[resumo estruturado](../ai/phase-5.6.2-validation-summary.json).

O ciclo vermelho inicial mostrou 10 falhas em 11 testes negativos: a maioria das
paráfrases e o ID válido com afirmação inválida passavam. Na primeira integração,
dois testes novos de memória pararam por falta de sessionId no comando de preparação;
a fixture foi corrigida antes da execução final. O sandbox bloqueou portas locais e
execuções assíncronas/subprocessos de testes; as suítes completas foram executadas
fora dele exclusivamente com provedores simulados e banco descartável. Erros de
persistência esperados são injetados pelos testes; não são falhas da rodada final.

Ruff, mypy, ESLint dos arquivos afetados, Prettier, build e typechecks foram
verificados. Não há evidência de UI visual nova: os canais públicos são exercitados
por integração HTTP/SSE real, e nenhum componente web foi alterado nesta fase.

## G. Limites e pendências

- Garantia de integridade/origem dos fragmentos, não prova semântica universal:
  pertinência, coesão da ordenação e verdade/atualidade do material preparado ainda
  dependem de autoria e avaliação. Nenhuma prosa livre do modelo fica publicada
  como afirmação material por ter apenas IDs ou rótulos válidos.
- Expressão espontânea restrita ao catálogo: seleção de voz, memória, atmosfera e
  perguntas. Novos gestos, metáforas ou alegações precisam de material autorizado;
  não há improvisação textual irrestrita. A variedade atual é pequena.
- Fontes maiores que o limite de um beat não são cortadas para parecer citações
  completas. Ficam preservadas no banco, mas não disponíveis como fragmento desse
  tamanho. Históricos legados não foram auditados retroativamente.
- Gemini não foi avaliado nesta fase. DIRECT/QUESTION do 561-01 continua pendente;
  561-03/04 preservam seus resultados históricos e os cinco cenários restantes
  continuam sem execução real. Uma avaliação futura exige nova autorização.

Essas pendências não se confundem com mecânicas Blue Rose e não iniciam 5.7.

## H. Decisão e proteção financeira

**APROVADA** a fronteira implementada: a paráfrase da galeria foi recusada antes de
persistir/publicar, com o fracasso oficial mantido, e os controles positivos passam.
Não se declara autonomia completa da Una nem fidelidade absoluta de toda campanha.

Zero tentativas externas, zero consumo novo de provedor. API key, modelo,
provedor, fallback, proteção financeira e `.env` permanente foram preservados;
a comparação por hash confirma os arquivos financeiros, contratos, plano congelado
e recibos históricos protegidos. Nenhuma alteração de billing ou ativação
permanente de AI_FREE_TIER_CONFIRMED. Nenhuma Fase 5.7 foi iniciada.
