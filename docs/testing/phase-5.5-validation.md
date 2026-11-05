# Fase 5.5 — implementação e validação

01/11/2026. Entrega estrutural para avaliação. Não certifica autonomia completa de Gloamhale nem aceite integral de 5.4/5.2. Nenhuma chamada Gemini/Groq real foi executada; nenhuma configuração de provedor, modelo, confirmação financeira ou fallback foi alterada nesta fase.

## Diagnóstico antes da implementação

1. CampaignsService gerava quantidade escolhida em POST campaigns (padrão 8). IMPORT usava definition.sessions.length; Gloamhale v1/v2 tinha seis capítulos de adaptação.
2. 120 min estava em campaigns.default_session_duration_minutes, campaign_sessions.estimated_duration_minutes, DTO/formulário e targetMinutes nas definições.
3. O cronômetro não encerrava automaticamente, mas activeSeconds/targetMinutes eram enviados ao planner; o texto/documentação ainda orientava sessões por duração.
4. Lifecycle já era AVAILABLE → IN_PROGRESS ↔ PAUSED → COMPLETED, com chat próprio e transação campanha → sessão. Motivos PLAYER_REQUESTED/NARRATIVE_PAUSE podiam liberar a seguinte sem prova narrativa.
5. Director usava opções confirmadas em NarrativeContextService; aventuras usavam adventureProgress, completionEvidence e revisão local REVIEW_SESSION.
6. Progresso local era proporção de objetivos; importado era 0/100. Não havia expressão genérica de alternativas nem terminal explícito.
7. Gloamhale estava em definições/módulo próprios, Story Cards, cenas, encontros, endings e seis sessões. Os PDFs mostram três partes, não seis sessões de duas horas.
8. AdventureRegistry selecionava ID/versão na composição; adventure_definitions guardava JSON/digest e adventure_instances vinculava o save. IMPORT recusava alterar versão/digest de instância.
9. Recibos narrativos referenciavam eventos game_events oficiais; provas de opção eram conferidas pela associação comando/ação/campanha/sessão.
10. SessionChat enviava content/mode/actionId, optionId/mechanic opcionais. FREE devolvia alvo nominal resolvido pelo servidor, sem referências selecionadas.
11. Identidades relacionais eram UUID; Story Cards usavam adventureEntityId(campanha,key,namespace). Itens e world_entities eram relacionais, sem identidade de objetos extraída do texto de salas.
12. DTOs/projeções filtravam PUBLIC/PLAYER_ONLY; adventure.gm existia apenas no planner e não no renderer público. Objetivos privados novos não podiam atravessar esse limite.

Leitura: documento-base; ADRs 0001–0007; arquiteturas de campanha/sessões, motor, Blue Rose, Director, memória, orquestração e registro; entregas/validações 4/5/5.1/5.2/5.3/5.4; contratos/fluxo FREE, seleção de ferramentas e renderer. PDFs locais: três partes/resoluções de Gloamhale e regras pertinentes de Blue Rose AGE. [Fontes e rastreabilidade privadas](../adventures/six-of-swords/session-structure.md).

Impacto previsto: contratos Zod/Pydantic → importação/criação → definição/evidências/Director → lifecycle → catálogo/resolução FREE → composer → testes/documentação. Riscos: mutar versões usadas, contagem duplicada de alternativas, liberação sem prova e spoilers por percentuais/catálogo. Não havia AGENTS.md aplicável no projeto. Alterações extensas preexistentes das fases anteriores foram preservadas; o diff acumulado do repositório não representa somente 5.5.

## Resultado e arquitetura

- Avaliador genérico de ALL/ANY/SEQUENCE, fatos, opções oficiais (incluindo falhas), eventos tipados e predicados sobre seus diffs. Chaves e referências validadas na definição.
- Objetivos MAIN/OPTIONAL/CONDITIONAL/ALTERNATIVE, disponibilidade e evidências; marcos agrupam rotas alternativas. Progresso oficial reproduzível e projeções públicas limitadas.
- Gloamhale v3 tem três unidades da aventura; v1/v2 mantidas. Nada foi reimportado automaticamente. A v3 inclui apuração de destinos independentes e política explícita de retirada definitiva.
- Novas campanhas são importadas/criadas atomicamente; POST campaigns não aceita quantidade/duração. A preparação/revisão inicial da equipe permanece local.
- Novas sessões só concluem com autorização do Director. Auditoria privada, resumo factual, fechamento e próxima disponibilidade/terminal confirmam juntos, sem liberar automaticamente o próximo chat.
- `CONFIRM_FACT` é capacidade local, sem endpoint público/LLM; exige fato definido, unidade ativa, pré-requisitos e provas oficiais, impedindo resultados exclusivos conflitantes. Não aplica efeitos da aventura por si só.
- Catálogo contextual NestJS e contrato mentions opcional, com UTF-16, autorização e revalidação antes da interpretação/execução. FREE preserva a identidade explícita; nomes ambíguos sem seleção não são escolhidos arbitrariamente.
- Composer mantém texto livre e fornece filtro, ↑/↓, Enter, clique, Escape, ausência de resultados e edição/exclusão de referências. [Contrato e limites](../ai/contextual-mentions.md).

O relógio real não entra no planner/Director, mas os comandos existentes de espera/descanso/arcana e os relógios ficcionais de Gloamhale permanecem. O pequeno ajuste adicional em nextSceneKey filtra somente companheiros para a preparação da próxima cena: NPCs presentes não são tratados como companheiros, evitando rejeitar uma transição legítima. Este ajuste foi motivado pelo teste de integração com menções a NPCs.

## Persistência, compatibilidade e reversão

Não houve migration nova: definição JSON versionada, game_events e metadados existentes suportam a mudança. Eventos NARRATIVE_FACT_CONFIRMED e NARRATIVE_UNIT_COMPLETED guardam fatos/provas privadas. Seus números derivados não são uma segunda fonte canônica. IDs/digests/namespace antigos permanecem; helpers de identidade foram extraídos e reexportados com compatibilidade.

Campanhas v1/v2 ou sem progression conservam o adaptador anterior, incluindo motivos legados. A política nova não é aplicada silenciosamente ao histórico. O endpoint de criação mudou intencionalmente: clientes que enviam plannedSessions/defaultSessionDurationMinutes recebem 400 e devem remover esses campos. As respostas/campos de banco antigos continuam; não se oferece essa escolha no formulário. Mensagens sem mentions continuam válidas.

Implantação: contratos/API/Python compatíveis antes do web. Manter todas as definições ainda usadas. Rollback: drenar turnos, voltar o web primeiro, preservar banco/tabelas/eventos/mensagens e manter runtime capaz de interpretar v3 para campanhas v3. Binário antigo não deve escrever nessas campanhas. Consultas dos chats não exigem apagar/reimportar saves. Não há down destrutivo. Banco real do usuário e seus volumes não foram modificados; testes e navegador usaram PostgreSQL descartável.

## Matriz de testes

| TEST-ID     | Evidência executável                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| TEST-55-001 | phase55.spec.ts: 48 horas de tempo real sem progresso/encerramento; progression.spec.ts sem entrada temporal        |
| TEST-55-002 | phase55.spec.ts: condição satisfeita → fechamento/auditoria/100 persistidos                                         |
| TEST-55-003 | progression.spec.ts e phase55.spec.ts: pré-requisito parcial ou ausente não encerra                                 |
| TEST-55-004 | ANY/rota alternativa oficial no avaliador e PostgreSQL; SEQUENCE aninhada                                           |
| TEST-55-005 | Objetivo OPTIONAL privado não cumprido não bloqueia terminal                                                        |
| TEST-55-006 | HTTP pause/resume e navegador, mesmo chat/histórico                                                                 |
| TEST-55-007 | Próxima LOCKED antes do fechamento; AVAILABLE depois; clique para start                                             |
| TEST-55-008 | Histórico anterior lido após iniciar o novo chat                                                                    |
| TEST-55-009 | character_knowledge preservado após transição, além das regressões de Story Cards                                   |
| TEST-55-010 | Repetição de CONFIRM_FACT e finalize não duplica prova/fechamento; avaliação pura idêntica                          |
| TEST-55-011 | Objetivo/prova GM_ONLY ausente em narrative-state, eventos, histórico e SSE                                         |
| TEST-55-012 | 90/99 antes de fechamento, terminal 100 após commit; retirada definitiva encerra sem liberar unidades não visitadas |
| TEST-55-013 | Eileen e ID exato selecionado nos testes HTTP/navegador                                                             |
| TEST-55-014 | Personagem known=false e sessão futura não aparecem no catálogo                                                     |
| TEST-55-015 | Lampião comum no inventário e objeto autorizado no catálogo #                                                       |
| TEST-55-016 | Item com quantidade 0/ID forjado recusado antes do LLM                                                              |
| TEST-55-017 | Personagem+item preservados na mensagem/contrato; seleção sequencial no navegador                                   |
| TEST-55-018 | Homônimos explícitos vinculados por ID; texto ambíguo e substituição recusados                                      |
| TEST-55-019 | Ação antiga sem mentions processada pelas suítes anteriores/novas                                                   |
| TEST-55-020 | Conhecido ausente não recebe memória de fala remota                                                                 |
| TEST-55-021 | IDs/tipos/rótulos/spans forjados, contexto obsoleto, provas inválidas e conflitos recusados                         |
| TEST-55-022 | Emoji UTF-16, acentos/espaços, deslocamento/edição/exclusão, teclado/clique/Escape/sem resultados                   |

Arquivos: `apps/api/test/progression.spec.ts`, `test/free-action.spec.ts`, `test/integration/phase55.spec.ts`, contratos `test/mentions.test.cjs`, web `test/mentions.test.mjs`, Python `tests/test_phase55.py`. Suítes históricas de lifecycle, motor, memória, aventuras, regras e narrativa também foram executadas. Fixtures históricas agora usam o repository interno para representar saves legados; a nova criação pública é testada separadamente, sem restaurar a configuração removida.

## Verificação no navegador

Fixture local com Gloamhale v3, NestJS/motor/PostgreSQL reais e cliente de IA simulado. Verificados: @Ei → Eileen; seleção por ↑/↓/Enter; #Lam → Lampião Azul; seleção por clique; múltiplas referências; busca inexistente e Escape; edição; envio persistido; pausa/retomada mantendo o chat. Nenhuma conta externa/LLM foi utilizada. [Captura da UI](phase-5.5-autocomplete.png).

## Resultados finais

- API: **231 testes aprovados / 24 suítes**, sem falhas; **93,75% linhas**, **83,52% branches**, **92,26% statements**, **96,30% funções**.
- Python: **84 testes aprovados**, sem falhas; **90% de cobertura**. Inclui FastAPI/LangGraph com provedor simulado e o contrato UTF-16.
- Contratos: **4 arquivos de testes aprovados**; web: **3 arquivos aprovados**, além da verificação interativa descrita acima.
- A orientação dinâmica dos objetivos/estados foi conferida no contexto privado do planner; os **10 testes de integração da Fase 5.5 foram reexecutados e aprovados** após esse ajuste, incluindo ausência desses dados em histórico/eventos/SSE.
- Tipagem TypeScript/mypy, lint ESLint/Ruff, builds API/contratos/Python e produção Next.js, exportações OpenAPI, format:check e git diff --check aprovados.
- PostgreSQL descartável com migrations existentes aplicadas; o banco real não foi utilizado. Erros de auditoria injetados produziram os 500 esperados e rollback, sem falhas finais de teste.
- O sandbox bloqueou servidores de teste/subprocessos do compilador e uma execução TestClient; os comandos necessários foram executados com permissão fora dele. O build Next.js passou pelo comando direto com webpack. Essas restrições do ambiente não foram contornadas por alteração da aplicação.
- O formatador também normalizou somente estilo de sete arquivos que já continham mudanças das fases anteriores (código arcano, documentação mecânica/regras, JSON de evidência, OpenAPI e script de avaliação). Não foram reescritas suas decisões, resultados ou regras.

Comandos reproduzíveis (usar `.tools/node_modules/.bin` no PATH):

```sh
node scripts/test-integration.mjs --coverage
node scripts/uv.mjs run pytest --cov=app --cov-report=term-missing
pnpm typecheck
pnpm lint
pnpm --filter @solo-rpg/shared-contracts test
pnpm --filter @solo-rpg/web test
pnpm contracts:api
pnpm build
pnpm format:check
git diff --check
```

## Pendências separadas e Fase 5.6

- **Fase 5.4:** falhas reais de seleção de ferramenta, ambiguidade e fundamentação OOC permanecem abertas. Regressões simuladas não reprovam nem aprovam novamente o Gemini. Não houve uso da autorização/orçamento anterior.
- **Blue Rose/5.2:** combate especial de Gloamhale, consumidores/contextos de arcanos, concentração/rodadas, Stunts do ritual, Convicção, Bonds e divergência de escudo continuam conforme a matriz anterior. Clock ficcional não foi removido. Critérios estruturais novos substituem a divisão arbitrária na v3, mas não automatizam a adjudicação semântica das consequências.
- **Limites de 5.5:** fatos subjetivos posteriores à vila ainda precisam de operador; faixa pública é deliberadamente aproximada; objetos dependem de accessible preparado, sem localização por sala no schema atual; não há uso genérico de item, múltiplos efeitos arbitrários ou rich text. A presença de Story Cards segue a cena preparada, não inferência da prosa. Não há avaliação de qualidade semântica por modelo real nesta fase.
- **Fase 5.6 proposta:** tratar a experiência visual ampla do LIMIAR, evoluir localização/autorização de objetos e composição de intenções, ampliar políticas mecânicas/subjetivas realmente necessárias e corrigir/reavaliar os casos reais de 5.4 com novo orçamento explícito. Não iniciar chamadas externas automaticamente.

## Alinhamento de impacto

Mudanças permaneceram nas fronteiras previstas: conteúdo versionado, importação/criação, Director/lifecycle, contratos/contexto, menções/composer e evidências/documentação. Não foram introduzidos serviços, dependências, tabelas específicas de Gloamhale ou comandos administrativos no LLM. O ajuste de transição para filtrar companheiros e a separação de fixtures históricas foram necessários à integração e estão cobertos. Não se sobrescreveram mudanças preexistentes, campanhas ou configurações financeiras.
