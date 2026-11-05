# KHAOS — seleção contextual da Una, Fase 5.6

## Diagnóstico e impacto

A investigação começou pelo documento-base, ADRs 0001–0009, arquiteturas de IA/Director/Game Engine, interpretador, ferramentas, renderer, contratos, menções, Gloamhale v3, testes e registros reais 5.4/entrega 5.5. Os PDFs locais foram inspecionados por extração e conferência visual dirigida: Blue Rose básico pp.15–17 distingue ações cotidianas e tentativas com risco; Six of Swords, escritório p.20, separa descrição pública de descobertas preparadas por Perception (Searching). São referências, não autorização para implementar novas regras ou copiar as dificuldades do PDF para uma cena não preparada.

| Questão                    | Diagnóstico                                                                                                                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LangGraph                  | PROPOSE faz uma chamada estruturada; NARRATE é outro estágio posterior ao commit. O grafo não executa ferramentas de escrita.                                                                                                                                                           |
| Contexto anterior          | Cena, atores, mundo, regras, opções filtradas e memória; o planner também recebia orientação privada `adventure.gm`. `requiresCheck` e intenção nominal eram a principal indicação da investigação preparada.                                                                           |
| Validação NestJS           | Zod estrito, resolução nominal e menções, compatibilidade intenção/ferramenta, opções atuais, modo ACT, personagens vivos/presentes e validação no motor sob locks.                                                                                                                     |
| Conhecimento               | Visibilidade PUBLIC/PLAYER_ONLY/GM_ONLY e associações por personagem já existem. HEARD/RUMOR não comprovam a verdade. Não foi criada uma nova taxonomia persistente.                                                                                                                    |
| Testes preparados          | `sessionPlans.options`, pré-requisitos `requiresOptionIds`, conclusão anterior, modo e check servidor. TN/foco/efeitos nunca pertencem à proposta.                                                                                                                                      |
| Impedimentos               | Capacidade ausente, requisito pendente, alvo ausente/inacessível, protagonista indisponível, combate incompatível, revisão obsoleta; regras do motor continuam finais.                                                                                                                  |
| Resultado                  | Pedido público → AWAITING_ROLL → dado servidor → evento/recibo/efeitos atômicos → NARRATE. A preparação não é descoberta.                                                                                                                                                               |
| Falha real de investigação | A saída registrou INVESTIGATE + QUERY/LOCATION; o adaptador aceitava essa contradição como OBSERVE. Não era ausência total de opção: ela constava no contexto.                                                                                                                          |
| Arcana/ambiguidade         | Registros reais mostram resposta incompatível com schema e fallback seguro, sem interpretação aprovada. A restrição posterior do schema de geração para FREE já existia no início desta fase e foi preservada. Não se atribui toda a falha ao modelo ou ao provider sem nova evidência. |
| OOC                        | Renderer aceitava frases explicativas novas sem prova de fonte; o acréscimo sobre reviravoltas foi reproduzido localmente.                                                                                                                                                              |
| Proteções anteriores       | Leases, revisão, transações, idempotência, menções revalidadas, resultados literais, isolamento de NARRATE, fallback limitado e progresso por eventos já funcionavam.                                                                                                                   |
| Menções                    | NestJS conserva UUID selecionado; o LLM retorna nomes. Havia conflito na conversão interna de FREE com menções para SCENE/MECHANIC, corrigido por comparação com a resolução interna gravada.                                                                                           |

Impacto realizado: contratos aditivos → visão de seleção Python → política NestJS → resposta informativa/renderer → testes e avaliação. O Game Engine e suas regras, lifecycle, banco e definições versionadas não foram alterados. Não há novo serviço, dependência, migration ou executor de múltiplas ferramentas.

## Política

`expression` descreve DIRECT, QUESTION, HYPOTHETICAL, NEGATED, QUOTED ou COMPOUND. `intent` conserva o vocabulário anterior e acrescenta QUERY. `evidence` seleciona no máximo oito chaves de fontes montadas pelo servidor; não contém texto de resposta nem dificuldades. Ambos os campos continuam opcionais/nullable no transporte legado. `SelectedFreeAction` os exige na geração nova quando existe `selection.version=1`.

Não existe classificador de palavras-chave ou chamada extra para decidir a ferramenta. O modelo interpreta a mensagem inteira, usando contexto e exemplos contrastivos. A política determinística rejeita combinações incompatíveis com essa interpretação, fontes, alvos e capacidades. Se o modelo marcar erroneamente uma hipótese como execução direta, o contrato sozinho não prova o significado do português: isso permanece um risco explícito da seleção e exige avaliação real.

| Ferramenta         | Fonte/autoridade                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QUERY              | PUBLIC/KNOWN, ou escopo específico RULES/INVENTORY/OBJECTIVES/MEMORY. Recupera texto autorizado; não cria conhecimento, eventos ou objetivos.                                  |
| OBSERVE            | PUBLIC ou inventário próprio autorizado. Não usa KNOWN para fingir percepção atual nem revela segredo.                                                                         |
| PREPARED_CHECK     | Tentativa DIRECT/INVESTIGATE e nome inequívoco de check atualmente disponível; motor mantém a dificuldade e consequências. Não é selecionado por uma palavra da mensagem.      |
| ARCANA             | Execução atual expressa; nome oficial e parâmetros necessários. O motor mantém conhecimento, tradição, alvo, consentimento, custos e resultados.                               |
| DIALOGUE           | Interlocutor presente/resolvido. Pedido de ação não comprova obediência. HEARD continua atribuído.                                                                             |
| CLARIFY/ADJUDICATE | Alvo ambíguo, parâmetros ausentes, capacidade inexistente, proposta contraditória ou composição sem executor. Perguntas são texto servidor, sem publicar o rascunho do modelo. |

A frase “Examino a porta procurando algo estranho” tem cinco fixtures: detalhe público → OBSERVE; capacidade aplicável → PREPARED_CHECK; descoberta anterior → QUERY/MEMORY; ausência de política → ADJUDICATE; inacessibilidade → CLARIFY. A mesma abordagem cobre livros, cartas, rastros, NPCs, inventário, fenômenos arcanos e registros anteriores. Estes casos são sintéticos e não acrescentam cânone a Gloamhale.

Perguntar “Como funciona Escudo?” seleciona regras. “Talvez eu devesse usar Escudo” não conjura. “Eu ergo meu Escudo” pode propor `psychic-shield/raised=true`; “uso minha magia nele” pede parâmetros. A negação/citação marcada impede execução mesmo que a proposta contenha ARCANA. Não há consumo por consulta. Mover Objeto/Moldar Vento só entram na resolução de contexto canônico quando a política devolve `ARCANE_CONTEXT_REQUIRED`, sem sobrescrever uma recusa por hipótese ou composição.

Ações compostas recebem esclarecimento sobre qual resolver primeiro. A lista de menções integral permanece na mensagem e no contexto; nenhuma ação secundária é executada, e nenhum pedido vira consentimento automático. Um executor transacional genérico fica para trabalho futuro.

## Fontes e descoberta

`information.ts` deriva fontes da cena pública, descrições de entidades acessíveis, inventário próprio com quantidade positiva, conhecimento associado à protagonista, regras recuperadas e objetivos públicos. Chaves são hashes do conteúdo/escopo/alvo, sem novo registro persistente. Não usa prosa do histórico, resumos, notas privadas ou conhecimento exclusivo de NPC como evidência. Relatos preservam um prefixo de atribuição/incerteza. O histórico público curto serve ao planner apenas para resolver pronomes, sem virar fonte factual; THINK/OOC são excluídos desse recorte.

QUERY/OBSERVE/OOC montam texto exclusivamente das fontes selecionadas. Ausência de fonte admite insuficiência. Fonte de outro escopo/alvo, chave inventada ou resposta maior que o limite pede esclarecimento. NARRATE recupera esse texto sem chamar o provedor; o validador também recusa qualquer acréscimo, mesmo estruturalmente válido. A resposta pode ser menos fluida ou selecionar fonte irrelevante, mas não inventa uma explicação para preencher a lacuna.

O servidor ainda pode oferecer descrições gerais quando uma pergunta é mais específica que o conteúdo. A relevância semântica da fonte escolhida precisa de revisão real; autorização de fonte não equivale a boa resposta. Na 5.6.2, NPCs passam ao renderer por composição de fragmentos autorizados: variantes expressivas revistas e citações do conhecimento próprio, com HEARD/RUMOR atribuídos. IDs válidos não autorizam paráfrases livres. A garantia é da origem e integridade dos fragmentos, não de relevância semântica absoluta. [Fronteira de publicação](narrative-renderer.md).

`targetEntityId` é opcional na preparação local de uma opção. Vincula a capacidade a personagem, objeto acessível ou item possuído. O planner recebe só nome/tipo; NestJS recusa redirecionamento e remove capacidades de alvos indisponíveis. Planos legados sem vínculo conservam seus validadores anteriores; autoria de capacidades novas deve fornecer o vínculo quando dependerem de um alvo específico.

## Auditoria e avaliação

Metadados internos `freeResolution` conservam ferramenta selecionada, ferramenta autorizada, expressão, fontes e motivo técnico fechado. Não entram na projeção pública. Nenhum erro publica a pergunta/descrição livre do planner. Propostas transformadas em SCENE/MECHANIC mantêm os recibos existentes para retry.

A matriz compartilhada está em `packages/shared-contracts/fixtures/phase56-semantic.json`: 101 mensagens/contextos, categorias A–H e 40 contrastes contextuais. Python atravessa o grafo com respostas roteirizadas; TypeScript valida as mesmas propostas contra cada snapshot. Casos adversariais incluem propositalmente ferramenta errada. O relatório distingue esses erros injetados de acurácia de um modelo.

`app.evaluation.selection` produz por padrão somente o [plano offline](phase-5.6-live-plan.json). A avaliação real exige novo `--authorize-live`, configuração Gemini já vigente, confirmação gratuita já vigente e fallback desativado na configuração existente. Não muda nenhuma dessas configurações. Há oito casos e no máximo uma requisição por caso, 700 tokens de saída cada, sem reparo automático. Interrompe em falha do provedor, schema/fallback ou proposta mecânica inesperada. Não publica narrativa nem escreve campanhas; `authorizedTool=null` indica que o relatório do modelo não atravessou NestJS. A autorização é avaliada separadamente na integração real com IA simulada.

```sh
# Nenhuma chamada externa:
node scripts/uv.mjs run python -m app.evaluation.selection
node scripts/uv.mjs run python -m app.evaluation.selection --summarize /tmp/khaos56-policy-report.json
# Somente depois de nova autorização explícita do operador:
node scripts/uv.mjs run python -m app.evaluation.selection --authorize-live --max-requests 8
```

Nenhuma autorização anterior da 5.4 é reaproveitada. [Evidências, cobertura e aceite](../testing/phase-5.6-validation.md).
