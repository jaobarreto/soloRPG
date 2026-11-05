# Validação da Fase 5.4

01/11/2026. Entrega do caminho de intenções livres e renderer experimental. **A avaliação real autorizada teve reprovações; o aceite integral permanece pendente das correções e reavaliações abaixo.** Não se declara autonomia completa de Gloamhale.

## Impacto e arquitetura

Leitura do documento-base, seis ADRs, Fases 4/5/5.1/5.2/5.3, arquiteturas de IA/memória/Director/aventura e regras/pendências Blue Rose. Baseline local já continha alterações extensas das fases anteriores; foram preservadas. Baseline executada: 164 testes da API/21 suítes, Python 59/91% cobertura. `pnpm test`/TestClient bloquearam no sandbox; testes Python e PostgreSQL foram reexecutados fora dele.

Impacto previsto/realizado: Zod/Pydantic → PROPOSE/NARRATE → adaptador NestJS → projeção pública/memória/eventos → testes e documentação. O Game Engine conserva implementações mecânicas e transações; sua allowlist não ganhou comandos administrativos. Apenas dois tipos de evento de fala foram acrescentados. Não há migration nova, mudança de versões/digests das aventuras, dependência ou serviço novo. UI teve somente o texto do botão para dispensar façanhas, compartilhado com ataques escolhidos pela protagonista.

Detalhes: [fluxo](../ai/autonomous-master.md), [interpretação](../ai/free-action-interpreter.md), [renderer](../ai/narrative-renderer.md), [ferramentas](../ai/tool-selection.md), [avaliação/orçamento](../ai/narrative-evaluation.md), [ADR](../adr/0007-intencoes-livres-e-falas-atribuidas.md).

## Evidências

| TEST-ID       | Evidência                                               | O que demonstra                                                                                                                  |
| ------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| TEST-AI54-001 | `test/free-action.spec.ts`                              | Matriz de 20 intenções, resolução unívoca de nomes, capacidades, parâmetros incompletos e ausência de IDs do modelo              |
| TEST-AI54-002 | Mesmo arquivo, renderer                                 | Prosa livre estruturada, resultado literal, referências, agência, rumor, OOC, consequências e fallback                           |
| TEST-AI54-003 | `integration/narrative.spec.ts`, diálogo e duas sessões | Réplica inédita persistida, memória própria, segredo da protagonista ausente no renderer, histórico original e retry idempotente |
| TEST-AI54-004 | Mesmo arquivo, investigação e ambiguidade               | Sem opção no payload, espera por dado oficial, resolução única; pergunta ambígua sem eventos/recursos                            |
| TEST-AI54-005 | Mesmo arquivo, OOC e falha da mensagem                  | Separação do mundo; rollback de evento/memória da réplica, retomada somente de NARRATE                                           |
| TEST-AI54-006 | `tests/test_phase54.py`                                 | Grafo com provedor simulado, diálogo em cena excepcional, renderer pós-commit, probe limitado e bloqueios financeiros            |
| TEST-AI54-007 | `test_turn_wire.py` + `test/narrative.test.cjs`         | Mesma fixture FREE serializada em FastAPI e consumida por Zod; campos administrativos/dificuldades recusados                     |
| TEST-AI54-008 | Suítes anteriores reexecutadas                          | Mecânicas, contexto crítico, falhas/429/timeout/JSON, lease, estado obsoleto, Director, eventos, histórico e persistência        |

Resultados finais: API **213 testes / 22 suítes**, linhas **93,62%**, branches
**83,34%**, statements **92,04%**, funções **95,96%**. Python **82 testes**, cobertura
**90%**; grafo 96%, schema 100%, adaptador Gemini 95%. Contratos compartilhados:
3 arquivos aprovados; web: 2 arquivos aprovados. TypeScript/mypy, ESLint/Ruff, builds
API/contratos, exportação OpenAPI e `git diff --check` aprovados. Não houve novo teste
no navegador: o único ajuste visual foi o rótulo da dispensa de façanhas; o fluxo
foi exercitado por HTTP/NestJS/PostgreSQL reais. Nenhum mock é evidência semântica real.

Comandos reproduzíveis, com `.tools/node_modules/.bin` no PATH:

```sh
node scripts/test-integration.mjs --coverage
node scripts/uv.mjs run pytest --cov=app --cov-report=term-missing
pnpm typecheck
pnpm lint
pnpm --filter @solo-rpg/shared-contracts test
pnpm --filter @solo-rpg/web test
pnpm contracts:api
git diff --check
```

## Consumo, falhas e limites

Métricas existentes registram PROPOSE/NARRATE, provedor/modelo, tokens, latência, erros e uso por turno/sessão. Uma conversa livre normal passa de uma para duas chamadas, com justificativa funcional: a segunda produz uma réplica que antes era descartada. Não há juiz LLM extra. Índice de atores contém só identidades, evitando duplicar memórias críticas no prompt. Contexto acima do limite continua recusado, sem apagar eventos ou chats.

Avaliação externa autorizada: **10 chamadas de um teto de 11**, com confirmação de
conta sem faturamento e retomadas aprovadas, sem fallback/retry automático. Uso
reportado: **9.237 entrada / 1.350 saída / 10.587 totais**, uma tentativa com contagem
desconhecida, 27.261 ms acumulados. [Resultados por caso e rubrica](../ai/narrative-evaluation.md#resultado-real-e-revisão-técnica).
A configuração normal permanece Gemini 3.5 Flash-Lite, confirmação financeira falsa
e fallback falso. Os probes não escreveram campanhas/PDFs nem usaram o banco real.

Problemas reais encontrados: HTTP 400 com schema narrativo limitado/aninhado;
gerar sem os limites superiores resolveu a rejeição observada, preservando todos
os limites locais. A causa interna exata do 400 não foi exposta pelo provedor.
Narração tinha pontuação divergente entre texto e beats: o grafo agora monta o texto
a partir dos beats, e o backend confere. Saídas inválidas recuperam por esclarecimento
ou projeção confirmada sem chamada de reparo; diagnósticos do probe expõem apenas
rótulos estáticos do schema. O modelo recebia contratos legados mesmo em ação livre:
agora recebe exclusivamente FreeAction nesse caminho. A continuidade passou após
essa restrição; ambiguidade/arcano não foram repetidos depois dela.

Limitações: prosa livre não tem prova semântica completa; regex tem falsos positivos/negativos; classificação real demonstrou falhas de contrato/seleção na amostra. Investigações com descoberta exigem política autorizada. Movimento arbitrário, uso genérico de item, efeitos sociais/ajuda e condições livres não estão automatizados. Mover Objeto/Vento têm limite de contexto único sem identidade de objeto; regras especiais, preparação de contextos, ritual e critérios subjetivos de Gloamhale continuam com as pendências 5.2. Ataques livres usam o combate comum existente; gastar façanhas da protagonista pela nova ação ainda não tem fluxo integrado, somente dispensa expressa. Duas sessões com fake não são duas sessões com Gemini real.

## Operação e reversão

Testes usam exclusivamente PostgreSQL descartável. Banco real, campanhas, fichas, sessões, PDFs e configuração financeira não foram modificados. Instalar contratos/NestJS antes de Python; manter versões compatíveis. Para voltar, drenar turnos pendentes e reverter Python antes de NestJS; conservar mensagens, eventos e tabelas. Não há down destrutivo ou reimportação automática. A próxima etapa é corrigir/reavaliar as reprovações e combinar novo orçamento; a Fase 6 permanece fora do escopo.

## Evidência mecânica livre adicional

`integration/arcana.spec.ts` executou Escudo, Curar em si com dado aguardado,
repouso e espera por texto livre, sem `mechanic` no payload. Repetição não rola de
novo, metadados resolvidos não vazam, e Curar outro alvo sem toque/consentimento
canônicos não produz efeitos. `integration/narrative.spec.ts` verificou também
ataque livre da protagonista, dano pendente até dispensa expressa de façanhas e
idempotência. Essas execuções usam motor real e LLM simulado, separadamente das
amostras Gemini, cujos resultados mecânicos são fixtures declaradas.

Contexto Gloamhale da fixture: 24.342 caracteres inicialmente / 28.502 após 42
memórias; pedidos PROPOSE 24.612 / 28.772, sem sistema/schema. São caracteres,
não tokens. O índice de atores foi reduzido a identidades, eliminando a duplicação
de personalidade e conhecimento detectada durante a implementação.
