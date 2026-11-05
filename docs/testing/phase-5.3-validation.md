# Validação da Fase 5.3 — Gemini, narrativa e autonomia

01/11/2026. **Entrega técnica parcial; a Fase 5.3 não está concluída.** Após um 404 em 2.5, conexão e uma amostra narrativa reais foram validadas em 3.5
com autorização adicional. Há também limites de
produto anteriores que impedem certificar diálogo livre e Gloamhale sem operador.
Não foi iniciada a Fase 6.

## Auditoria e impacto

Foram lidos o documento-base integral, seis ADRs, relatórios das Fases 4, 5, 5.1 e
incremento 5.2, arquitetura de orquestração/memória/Director/aventura e regras/pendências
Blue Rose. Inspecionados provedores, LangGraph, gateway NestJS, adaptador narrativo,
contexto, schemas compartilhados e registro (Gloamhale v1/v2).

A linha de base continha alterações locais extensas das fases anteriores. Foram
preservadas, sem reset, reimportação de campanha ou atribuição de todo o diff a esta
fase. A auditoria confirmou que 5.2 **não** entrega todas as regras solicitadas.

Impacto previsto e realizado: configuração/roteamento Python → contrato de métricas
→ persistência/agregação NestJS; contexto → personagens/Story Cards; avaliação
isolada → testes/documentação. A migration 0010 é aditiva, somente em `ai_usage`.
Não se alteram fórmulas Blue Rose, versões/digests das aventuras, comandos
administrativos públicos, frontend ou condições de aceite dos capítulos.

| Problema encontrado                                                     | Correção / resultado                                                                                            |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Fallback usava apenas uma confirmação financeira                        | Groq exige confirmação própria, além da confirmação global e habilitação de fallback                            |
| Duas tentativas de até 31 s excediam os 55 s do gateway                 | Prazo compartilhado até 48 s; tentativa até 20 s por default; fechamento limitado a 1 s por adaptador           |
| Não havia orçamento reutilizável no roteador                            | Orçamento conferido antes da chamada; padrão de até duas tentativas por etapa; probe limitado a 1 ou 2 no total |
| NARRATE gastava tokens para copiar um texto já fixo                     | Retorno determinístico da projeção, sem chamada externa; validação NestJS mantida                               |
| Memória de personagens usava limite global 60 e omitia origem           | Todas as associações críticas, até oito das demais por personagem; origem preservada                            |
| Story Cards usavam limite global 40                                     | Recuperação dos eventos associados ao cast presente, sem descartar silenciosamente o conflito de outro NPC      |
| Contexto repetia a mensagem atual e buscava regras/relações arbitrárias | Mensagem atual enviada uma vez; regras dos recursos/opções; relações dos presentes                              |
| Usage ausente parecia zero consumido                                    | Flag de contagem reportada, total opcional, tamanho do prompt, etapa e agregação por turno/sessão               |
| Faltava autenticação interna configurada                                | Segredo local gerado no `.env` ignorado; valor não exibido; nenhuma flag financeira persistida                  |
| Exceção inesperada/debug de SDK podia escapar da fronteira sanitizada   | Códigos seguros, fechamento contido e logs de transporte/SDK limitados a WARNING                                |

Nenhuma alteração financeira foi feita. Foram três tentativas autorizadas:
2.5 retornou HTTP 404 em 1.700 ms, sem usage; 3.5 respondeu à conexão e ao rascunho
em 2.176 / 3.427 ms, reportando 1.376 tokens de entrada e 177 de saída (1.553 totais).
Sem retry/fallback ou uso do Groq. A responsável confirmou projeto sem billing;
a flag foi aplicada só aos processos autorizados. Modelo efetivo final:
`gemini-3.5-flash-lite`, após atualização dos defaults verificados.
[Modelos/fontes](../ai/model-evaluation.md), [evidência real](../ai/live-model-validation.md).

## Evidência executada

| Grupo                        | Linha de base                      | Resultado de regressão                                            |
| ---------------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| API + PostgreSQL descartável | 153 testes / 21 suítes aprovados   | 164 testes / 21 suítes aprovados                                  |
| Cobertura API                | Linhas 93,90%; branches 83,77%     | Linhas 94,02%; branches 83,82%; statements 92,41%; funções 97,29% |
| Python                       | 35 testes aprovados; cobertura 93% | 59 testes aprovados; cobertura 91%                                |
| Contratos compartilhados     | Suíte existente                    | 3 arquivos aprovados, incluindo fixture HTTP comum Python/Zod     |
| Web                          | Sem alterações de produto          | 2 arquivos aprovados                                              |
| Tipagem/lint                 | Checagem após implementação        | TypeScript/mypy e ESLint/Ruff aprovados                           |
| Builds/contratos             | Exportação sem listener            | Build API/contratos e OpenAPIs API/FastAPI aprovados              |

Os quatro testes novos de orçamento, confirmação independente, tamanho de contexto e
cópia redundante foram executados antes da correção: falharam; passaram depois.
Os cenários adicionais de memória, métricas e Director validam as fronteiras reais
NestJS/PostgreSQL com cliente LLM simulado. A leitura de Story Cards não compartilha
uma memória entre identidades.

O `pnpm test` inicial foi interrompido (130) porque o TestClient Python bloqueou no
sandbox. Python foi reexecutado fora dele e passou. O compilador TypeScript também
retornou falha sem diagnóstico no sandbox; fora dele revelou uma tipagem de etapa
alargada, corrigida com a união PROPOSE/NARRATE. Tipagem e regressões passaram após
a correção. Falhas de auditoria/resumo intencionalmente injetadas retornam erro e
rollback; não são falhas não resolvidas da suíte.

### Medição de contexto sintético

Fixture de Gloamhale v1, cena inicial `foiled-trap`, campanha descartável:

| Estado                   | Caracteres do contexto | Caracteres do pedido PROPOSE |
| ------------------------ | ---------------------: | ---------------------------: |
| Inicial                  |                 23.553 |                       23.823 |
| Após 42 memórias de cast |                 27.713 |                       27.983 |

Medição isolada `retrieves old named-cast...`, sem LLM. Pedido de exemplo com fala
curta; não inclui instrução de sistema/schema ou seleções opcionais. Contagem JS
serializada; a fixture não contém caracteres fora do BMP. Não são tokens. O teste
comprova que a lembrança antiga de Griseld permanece mesmo após 41 relatos de Amos.
Outro teste retém o conflito e rumor de um NPC após 65 lembranças críticas de outro.
O orçamento de 65.000 caracteres recusa contexto excessivo; compactação automática
de fatos críticos ainda não existe.

## Registro de evidências por requisito

| TEST-ID       | Nível / propósito                    | Fronteira e evidência                                                                                                                                                       | Avaliação                                                                      |
| ------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| TEST-AI53-001 | unit / specialized protection        | `tests/test_providers.py`, SDK/transporte simulado: confirmação, allowlist, orçamento, timeout compartilhado, fallback/erros sanitizados                                    | Coberto sem API externa                                                        |
| TEST-AI53-002 | integration / regression protection  | `integration/narrative.spec.ts`: recuperação de conflitos/rumor por NPC, segredo sem testemunha, relações/mundo/recursos                                                    | Montagem/persistência cobertas; atuação real pendente                          |
| TEST-AI53-003 | integration / critical path          | Mesmo arquivo: seis encerramentos, evidências, objetivo pendente aos 7.300 s, alternativa pacífica preparada, falha de resumo e retry                                       | Coberto, sem encerramento por tempo                                            |
| TEST-AI53-004 | integration / critical path          | `integration/adventure-registry.spec.ts`: duas sessões completas, testes, Curar, tempo, resumo/histórico/memória; `integration/gloamhale.spec.ts`: continuidade da aventura | Coberto no recorte, com LLM simulado; Gloamhale assistida                      |
| TEST-AI53-005 | integration / rule protection        | `integration/arcana.spec.ts`, `blue-rose-mechanics.spec.ts`, `narrative.spec.ts`, `gloamhale.spec.ts`: sete arcanos parciais, combate comum, ritual, rollback/idempotência  | Recorte coberto; regras ausentes não certificadas                              |
| TEST-AI53-006 | contract / regression protection     | `fixtures/ai-turn-response.json` consumida por rota FastAPI serializada e Zod; métricas agregadas por HTTP/Nest/PostgreSQL                                                  | Coberto; fixture é sintética                                                   |
| TEST-AI53-007 | unit / critical path                 | `tests/test_phase53.py`: quatro modos, onze mensagens livres, NARRATE sem gasto; `test_live_validation.py`: duas barreiras do probe                                         | Fluxo simulado coberto; interpretação real pendente                            |
| TEST-AI53-008 | smoke / specialized protection       | `app.evaluation.live`, [roteiro e orçamento](../ai/live-model-validation.md)                                                                                                | 3.5: conexão e resposta narrativa executadas; limites qualitativos registrados |
| TEST-AI53-009 | integration / specialized protection | [Rubrica de qualidade](../ai/narrative-quality-report.md), amostras reais e revisão humana                                                                                  | Pendente; nenhum escore inventado                                              |

### Continuidade e falhas

A suíte executou a campanha experimental original de duas sessões inteiras e a
continuidade de Gloamhale. Resumo complementa mensagens; próxima sessão fica AVAILABLE
e só inicia explicitamente. Mundo, recursos, relações e conhecimento sobrevivem;
o encerramento não avança tempo ficcional. A fixture original joga sem administração
durante o percurso. Gloamhale ainda usa preparação/revisão humana em cenas posteriores;
essa evidência não certifica os seis capítulos autônomos.

Falhas verificadas: timeout, 429, modelo indisponível, autenticação, JSON inválido,
transporte simulado, persistência de mecânica/auditoria e resumo, geração após commit,
reenvio e retomada concorrente de dados. Nenhum desses testes autoriza repetir efeitos
confirmados. Reconexão relê registros; não houve teste de falha física de rede.

## Critérios ainda pendentes

- Conexão/resposta externa e confirmação da conta já verificadas no recorte; aprovação literária humana ampla continua pendente.
- Matriz ampla de interpretação livre, quatro modos e personalidade com modelo real; há só uma amostra curta em português.
- Prosa literária no produto: a publicação continua limitada à projeção autorizada.
- Ações sem seleção preparada não resolvem automaticamente testes ou consequências.
- Combates especiais de Gloamhale, arcanos completos, concentração em combate,
  Convicção/Bonds e critérios alternativos dos capítulos 2–6 continuam pendentes.
- Consumo representativo de campanha e demonstração de caber em duas horas; há métricas reais apenas dos dois pedidos mínimos.
- Qualidade real de duas sessões narrativas e ajuste mínimo de UI, se necessário
  após existir uma política para texto livre; nenhum design foi iniciado.

Respeito à agência, sigilo público, resultados oficiais, histórico e idempotência
têm evidência determinística no recorte. Isso não torna o Mestre totalmente autônomo.

## Operação e reversão

Só foram migrados bancos descartáveis. Banco real, campanhas, fichas, chats e PDFs
nunca foram importados/alterados. Foram configurados o segredo interno local ausente e os defaults de modelo 3.5
verificados; a flag financeira normal permanece falsa. Sem novos serviços/dependências pagas.

Para instalar em dados reais: backup verificável → pausar serviços/sessões → aplicar
migrations até 0010 → contratos/NestJS novo → Python novo → reiniciar. O NestJS novo
aceita usage antigo por defaults; Python novo envia campos que o NestJS antigo
estrito rejeita. Para reverter, pausar e voltar primeiro Python, depois NestJS,
preservando tabelas/migration/histórico. Não há down destrutivo nem upgrade automático
de definição de aventura.

Comandos, com `.tools/node_modules/.bin` no PATH:

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

Resultados complementares: [modelos](../ai/model-evaluation.md),
[live](../ai/live-model-validation.md), [qualidade](../ai/narrative-quality-report.md),
[consumo](../ai/token-usage-report.md), [ferramentas](../ai/tool-calling-validation.md).

## Experimento real concluído no orçamento

A responsável autorizou primeiro até duas chamadas 2.5. O erro 404 interrompeu a
execução após uma. Depois autorizou até duas novas em 3.5; ambas responderam.
Total de três tentativas, nenhuma além do orçamento. O default foi atualizado para
3.5, mas a flag financeira normal continua falsa: não se autorizou consumo contínuo.
O 404 agora produz orientação pública segura para revisar o modelo, em vez de
apenas sugerir repetir indefinidamente. Um teste de integração protege esse caso.
[Relatório e evidências](../ai/live-model-validation.md).
