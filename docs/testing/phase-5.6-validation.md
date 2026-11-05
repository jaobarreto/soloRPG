# KHAOS — entrega e validação da Fase 5.6

01/11/2026. **Implementação estrutural validada; aprovação semântica real pendente.** Houve autorização nova para até oito requisições Gemini. A execução foi impedida pela configuração existente `AI_FREE_TIER_CONFIRMED=false`, antes de criar o SDK: **zero requisições e zero tokens externos**. A configuração financeira não foi alterada.

## 1. Diagnóstico

A leitura e as responsabilidades estão registradas no [diagnóstico detalhado](../ai/phase-5.6-selection.md#diagnóstico-e-impacto). As duas regressões reproduzidas antes da correção foram: `INVESTIGATE + QUERY/LOCATION` aceito como OBSERVE, e acréscimo OOC sem fonte aceito pelo renderer. O comando `pnpm --filter @solo-rpg/api exec jest --runInBand test/phase56.spec.ts` falhou nos dois sintomas e passou depois da correção.

Os registros reais 5.4 também mostraram falhas de schema em Arcana/ambiguidade. A restrição da geração para FREE já existia nesta baseline; foi conservada. A causa semântica de uma saída futura não pode ser atribuída integralmente ao prompt sem observar o modelo novamente. As opções preparadas existiam, mas o significado de `requiresCheck` e a distinção entre recuperar e descobrir estavam pouco claros. No backend, consulta/observação compartilhavam a mesma resolução. No renderer, referências válidas não limitavam uma explicação nova em OOC.

A baseline tinha alterações extensas das fases anteriores. Elas foram preservadas; `git diff` contra HEAD inclui trabalho anterior e não deve ser interpretado como diff exclusivo da 5.6.

## 2. Implementação e arquivos

| Arquivos                                                                                                     | Responsabilidade na fase                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shared-contracts/src/free-action.ts`                                                               | Intenção QUERY; campos opcionais `expression` e `evidence`, sem resultados ou comandos administrativos.                                                                              |
| `packages/shared-contracts/src/narrative.ts`                                                                 | Vínculo opcional `targetEntityId` na preparação local, fora do contrato de proposta do modelo.                                                                                       |
| `apps/ai-service/app/narrative/schemas.py`                                                                   | Espelho Pydantic e `SelectedFreeAction` para geração nova com expressão/fontes obrigatórias.                                                                                         |
| `apps/ai-service/app/narrative/selection.py`                                                                 | Visão FREE limitada: fontes, alvos, capacidades atuais e discurso público para resolver referências.                                                                                 |
| `apps/ai-service/app/narrative/prompts.py`, `graph.py`                                                       | Una, decisões contextuais/Arcana/negação/composição; uma chamada PROPOSE; informação sem chamada literária adicional.                                                                |
| `apps/api/src/narrative/information.ts`, `context.service.ts`                                                | Fontes autorizadas, inventário positivo, conhecimento próprio, objetivos públicos e disponibilidade de alvos preparados.                                                             |
| `apps/api/src/narrative/free-action.ts`                                                                      | Validação da expressão, fontes/escopos, alvos/menções, contradições e capacidade disponível. Consulta sobre NPC conhecido ausente pode usar menção revalidada sem torná-lo presente. |
| `apps/api/src/narrative/resolution.service.ts`                                                               | Auditoria interna, conversão segura com menções, revalidação de alvo na retomada e proteção contra sobrescrever recusa por contexto arcano.                                          |
| `apps/api/src/narrative/rendering.ts`                                                                        | QUERY/OBSERVE/OOC não aceitam acréscimos à resposta fundamentada.                                                                                                                    |
| `apps/ai-service/app/evaluation/selection.py`, `replay.py`                                                   | Plano/avaliação limitada, métricas e ponte offline para integração entre linguagens.                                                                                                 |
| `packages/shared-contracts/fixtures/phase56-semantic.json`                                                   | Matriz compartilhada com 101 cenários e expectativas separadas das propostas adversariais.                                                                                           |
| `apps/api/test/phase56.spec.ts`, `test/integration/phase56.spec.ts`, `apps/ai-service/tests/test_phase56.py` | Política, grafo, autorização, resultado, persistência, renderer e bloqueios financeiros.                                                                                             |
| `test/free-action.spec.ts`, `tests/test_phase54.py`, `fixtures/ai-free-turn-response.json`                   | Expectativas anteriores ajustadas para fundamentação OOC e campos aditivos.                                                                                                          |
| `packages/shared-contracts/openapi/ai.json`                                                                  | Schema Python reexportado localmente; API também reexportada sem abrir portas.                                                                                                       |

Documentação: [ADR 0010](../adr/0010-selecao-contextual-e-respostas-fundamentadas.md), política, interpretador, renderer, orquestração, índice de testes e README. Nenhuma migration, nova tabela, regra Blue Rose, definição/digest de Gloamhale ou configuração de provedor/billing foi alterada nesta fase. Não houve mudança no autocomplete ou na UI.

## 3. QUERY, OBSERVE e PREPARED_CHECK

QUERY recupera fontes públicas ou conhecidas, inventário, regras e objetivos, de acordo com o assunto; não grava eventos, conhecimento ou progresso. OBSERVE recupera somente fontes perceptíveis e inventário próprio autorizado. O texto é montado pelo servidor a partir das chaves selecionadas, sem permitir que a prosa acrescente descobertas.

PREPARED_CHECK exige tentativa de descoberta e capacidade disponível por nome exato. Pré-requisitos/completude, alvo quando vinculado, modo, presença/acesso e estado atual são revalidados; o motor define teste e consequências. Uma proposta contraditória é esclarecida ou adjudicada, sem escolher automaticamente outro efeito. Não há classificador textual por palavras-chave.

A matriz contém cinco estados para a mesma frase sobre porta, livro, carta, rastros, NPC, item de inventário, fenômeno arcano e registro anterior: visível, preparado, conhecido, sem política e inacessível. Estes são fixtures sintéticas, sem novos fatos canônicos. O estado conhecido usa memória, sem repetir teste; o estado público usa observação, sem rolagem.

## 4. Arcana

Pergunta sobre magia usa QUERY/RULES; hipótese, negação e citação não executam efeitos; execução atual pode propor ARCANA. Parâmetros omitidos ou alvo ambíguo pedem esclarecimento. Conhecimento/tradição, toque, consentimento, custos e resultados permanecem nos validadores anteriores. A etapa canônica de Mover Objeto/Moldar Vento não pode sobrescrever uma recusa semântica. Nenhuma regra arcana foi ampliada.

## 5. Ambiguidade e composição

Nomes únicos e menções resolvidas conservam a identidade autorizada. Homônimos sem seleção, parâmetros mecânicos ausentes, alvo indisponível e fontes incompatíveis pedem esclarecimento. Erro de schema usa fallback único, sem reparo automático. COMPOUND conserva o pedido integral e solicita qual tentativa resolver primeiro; não executa uma parte arbitrária nem presume obediência do NPC.

O planner pode resolver pronomes pelo discurso público curto, que não é evidência de verdade. Nenhum texto THINK/OOC é transferido para esse recorte. A qualidade desse reconhecimento permanece dependente do modelo. Não foi criado um decompositor ou executor transacional genérico de múltiplas ferramentas.

## 6. Fundamentação OOC e descobertas

Fontes derivam das projeções públicas, do conhecimento da protagonista e de regras disponibilizadas. GM_ONLY, orientação privada do Director, conhecimento exclusivo de NPC, resumos e falas livres não se tornam fontes factuais do planner. HEARD/RUMOR preservam atribuição e incerteza. Falas de NPC continuam registros de fala, sem comprovação automática do conteúdo ou conclusão de objetivos.

Ausência de fonte produz admissão de insuficiência. OOC/QUERY/OBSERVE conservam texto servidor também em NARRATE, sem gasto extra de LLM. O renderer rejeita o acréscimo de reviravoltas registrado na 5.4. Resultado mecânico e descoberta oficial continuam baseados em eventos/recibos confirmados; uma falha não narra sucesso nem associa descoberta à protagonista.

## 7. Testes e métricas

| Camada                                            | Resultado final                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| API, unidades e integração com PostgreSQL isolado | **348 aprovados / 26 suítes; zero falhas**                                                                                           |
| Cobertura API                                     | **93,70% linhas; 92,30% statements; 84,02% branches; 96,43% funções**                                                                |
| Python, grafo, contratos e avaliadores            | **202 aprovados; zero falhas; 87% cobertura**                                                                                        |
| Módulos específicos                               | Adaptador FREE: 95,23% linhas / 92,17% branches; fontes: 100% linhas; grafo Python: 96%; schema Python: 99%; visão de seleção: 100%. |
| Contratos compartilhados                          | **4 arquivos de testes aprovados**                                                                                                   |
| Web                                               | **3 arquivos de testes aprovados**, incluindo menções                                                                                |
| Verificações                                      | TypeScript/mypy, ESLint/Ruff, build API/contratos, exportações OpenAPI e revisão de whitespace aprovados.                            |

O script de replay Python é exercitado em processos filhos pela integração NestJS; essa execução não é agregada à cobertura Python do pytest e aparece como 0% naquele relatório. Não é um SDK real nem uma chamada externa. Nenhum novo teste visual foi necessário porque não houve mudança na interface.

| TEST-ID       | Evidência                                                                                                                                    | Limite                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| TEST-AI56-001 | Mesmos 101 casos em Pydantic/grafo Python e Zod/política NestJS                                                                              | Respostas roteirizadas; não mede compreensão do modelo.                                |
| TEST-AI56-002 | Fontes/escopos, atribuição de rumor, alvo de capacidade, menção sobre ausente e regressões capturadas                                        | Validação de autoridade; relevância semântica não é provada.                           |
| TEST-AI56-003 | Dez integrações HTTP → Python real com provedor simulado → NestJS → motor/PostgreSQL → renderer                                              | Mede integração e integridade, sem Gemini.                                             |
| TEST-AI56-004 | 40 contrastes, oito grupos com cinco estados                                                                                                 | Expectativas contextuais explícitas; o modelo ainda precisa ser medido nesses estados. |
| TEST-AI56-005 | Falha/sucesso oficial, teste pendente, retry idempotente, fontes públicas, invisibilidade de segredo, hipóteses/negações/citações/composição | Nenhuma regra mecânica nova.                                                           |
| TEST-AI56-006 | Bloqueios de autorização/plano gratuito/provedor/fallback, limite e interrupções com provedor simulado                                       | A execução autorizada real parou antes do SDK por configuração gratuita falsa.         |

A matriz contém 20 propostas propositalmente divergentes da ferramenta esperada, incluindo fontes inválidas, capacidades ausentes, ação negada marcada com ferramenta mecânica e alvos inacessíveis. As **101 resoluções autorizadas corresponderam às expectativas**, inclusive recusas. Isso não significa 100% de acurácia semântica. O relatório registra 7 propostas mecânicas bloqueadas e 13 tentativas de descoberta impedidas por condições/fontes insuficientes; são contadores determinísticos de fixtures.

Resumo equivalente à matriz de confusão, com resultado da política:

| Ferramenta esperada      | Proposta roteirizada                                                       | Resolução autorizada                          |
| ------------------------ | -------------------------------------------------------------------------- | --------------------------------------------- |
| QUERY, 30                | QUERY 29; ARCANA 1                                                         | QUERY 28; CLARIFY 2                           |
| OBSERVE, 17              | OBSERVE 17                                                                 | OBSERVE 17                                    |
| PREPARED_CHECK, 10       | PREPARED_CHECK 9; QUERY 1                                                  | PREPARED_CHECK 9; CLARIFY 1                   |
| ARCANA, 2                | ARCANA 2                                                                   | ARCANA 2                                      |
| DIALOGUE, 3              | DIALOGUE 3                                                                 | DIALOGUE 3                                    |
| ADJUDICATE, 13           | ADJUDICATE 12; PREPARED_CHECK 1                                            | ADJUDICATE 12; CLARIFY 1                      |
| CLARIFY/não executar, 26 | CLARIFY 9; OBSERVE 8; ARCANA 3; DIALOGUE 2; ADJUDICATE 2; COMBAT 1; REST 1 | CLARIFY 21; pensamento privado sem execução 5 |

Há 59 resoluções informativas, mecânicas ou de diálogo autorizadas, 25 esclarecimentos, 12 adjudicações e cinco mensagens privadas sem execução. O sistema não foi convertido em CLARIFY para todos os casos. Falsos positivos/negativos estão no [resumo JSON](../ai/phase-5.6-policy-summary.json); [linhas de evidência](../ai/phase-5.6-policy-results.json). Os erros de seleção desse JSON são injetados, não medições do Gemini.

Comandos reproduzíveis, a partir da raiz:

```sh
PATH="$PWD/.tools/node_modules/.bin:$PATH" pnpm --filter @solo-rpg/shared-contracts build
PATH="$PWD/.tools/node_modules/.bin:$PATH" node scripts/test-integration.mjs --coverage
node scripts/uv.mjs run pytest --cov=app --cov-report=term-missing
PATH="$PWD/.tools/node_modules/.bin:$PATH" pnpm typecheck
PATH="$PWD/.tools/node_modules/.bin:$PATH" pnpm lint
PATH="$PWD/.tools/node_modules/.bin:$PATH" pnpm --filter @solo-rpg/shared-contracts test
PATH="$PWD/.tools/node_modules/.bin:$PATH" pnpm --filter @solo-rpg/web test
```

Testes de servidor/TestClient/PostgreSQL precisaram executar fora do sandbox por restrição local de sockets. Continuaram usando somente banco descartável e IA simulada. Foram reexecutadas as regressões de 5.4/5.5, incluindo memória/histórico, leases, pausa/revisão obsoleta, progressão, fala atribuída, rolagens, auditoria, recuperação e persistência.

## 8. Avaliação real e reavaliação dos quatro problemas

O operador autorizou nesta conversa **até oito requisições, 700 tokens de saída por requisição**, para o [plano apresentado](../ai/phase-5.6-live-plan.json), sem mudança de modelo/provedor/billing/fallback. O modelo configurado foi verificado como `gemini-3.5-flash-lite`, fallback desativado. A confirmação gratuita existente era falsa. `--authorize-live --max-requests 8` retornou **FREE_TIER_NOT_CONFIRMED, requests=0** antes da criação do provider. [Registro](../ai/phase-5.6-live-result.json).

Não se definiu variável temporária para contornar essa confirmação e não se alterou `.env`. Nenhum saldo/autorização da 5.4 foi reutilizado. Não houve resultado semântico real nem consumo externo nesta fase. Autorizar a execução e confirmar a configuração gratuita são condições distintas.

| Falha 5.4                       | Reavaliação da implementação                                                                                    | Semântica real                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Investigação → QUERY/LOCATION   | Contradição reproduzida e recusada; capacidades nomeadas e fontes/contextos diferenciados                       | Pendente                                                             |
| Arcana com saída inválida       | Schema de geração específico preservado e enriquecido; execução separada de pergunta/hipótese, motor inalterado | Pendente                                                             |
| Ambiguidade com erro estrutural | Esclarecimento válido, parâmetros não inferidos, fallback limitado e nomes/menções revalidados                  | Pendente                                                             |
| OOC com acréscimo sem fonte     | Acréscimo capturado agora recusado; respostas informativas determinísticas, sem chamada literária               | Controle estrutural comprovado; seleção/relevância da fonte pendente |

Uma avaliação futura deve manter o orçamento e revalidar a configuração pelo operador. A escolha da fonte e da expressão também entra na rubrica, além de ferramenta/intenção. O relatório real deixa `authorizedTool=null` quando não atravessou NestJS; os testes de autorização permanecem separados.

## 9. Pendências

- **Seleção de ferramentas:** avaliação real bloqueada; relevância das fontes; reconhecimento de expressão/pronomes em português; planos legados sem vínculo de alvo; decomposição de tentativas independentes/dependentes mais rica. Anotações do modelo não são prova determinística de significado.
- **Qualidade literária:** consultas/observações/OOC usam excertos e podem soar técnicos; diálogo expressivo mantém os limites semânticos/lexicais da 5.4. Não foi introduzido juiz LLM.
- **Mecânicas Blue Rose / Fase 5.7:** combate especial, Convicção, Bonds, stunts incompletos, efeitos arcanos e rituais continuam em [pendências oficiais](../rules/blue-rose-pending-rules.md). Nenhuma regra foi implementada para encobrir seleção incorreta.
- **Exploração livre:** sem política preparada, não há dificuldade ou descoberta inventada; uso genérico de item e alteração de relações continuam sem executor. Objetos ainda usam a disponibilidade autorizada existente, sem novo mapa objeto→sala. Observações não criam uma arquitetura nova de memória; fatos de sessões anteriores precisam das associações oficiais existentes.

## 10. Status de aceite

**Aprovado estruturalmente no recorte:** contratos aditivos, fontes e autorização, estados contextuais, ausência de efeitos por consulta/negação/hipótese marcada, alvos e menções, resultados oficiais, idempotência, persistência, memória, progresso e regressões. Nenhuma chamada externa não autorizada ocorreu.

**Pendente de aprovação semântica real:** escolher corretamente intenção, expressão, fonte e ferramenta a partir de linguagem natural com o Gemini configurado. A execução foi autorizada, mas bloqueada pela confirmação gratuita falsa; não há evidência para declarar autonomia completa da Una ou correção semântica comprovada das reprovações 5.4.
