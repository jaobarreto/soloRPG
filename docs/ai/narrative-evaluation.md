# Avaliação narrativa — Fase 5.4

01/11/2026. Evidência disponível: contratos, política determinística, grafo com LLM simulado e NestJS/PostgreSQL descartável. **Foram realizadas 10 chamadas Gemini autorizadas, em seis tipos de cenário, dentro do teto de 11.** A evidência real da Fase 5.3 é histórica e não certifica o fluxo novo.

A matriz de vinte situações está em `test/free-action.spec.ts`: conversar, investigar objeto, examinar ambiente, arcano, atacar, defender, descansar, esperar, explorar, deslocar, recusar, negociar, mentir, ajudar, OOC, corrigir, pensar, impossível, ambígua e não prevista. Verifica intenção estruturada, alvos, ferramenta e limites. São rótulos fornecidos por mocks, não prova de classificação semântica real.

`integration/narrative.spec.ts` acrescenta diálogo sem opção, sigilo de memória individual, ambiguidade sem efeitos, investigação com dado pendente, OOC/correção, prosa inválida, rollback da memória da réplica e duas sessões com histórico original intacto. O exemplo simulado de Mira responde “Não sei se podemos confiar nele. O que despertou sua suspeita?”; essa frase vem do fake do teste, não do Gemini. A continuidade mede recuperação da fala anterior e da personalidade, sem atribuir qualidade literária ao mock.

Agência é reprovada para decisões, pensamentos, sentimentos e falas inventados da protagonista, assim como para ferimentos, itens, objetivos e resultados extras. Incerteza de rumor, speaker ausente, referência de conhecimento alheio e substituição de fracasso por sucesso têm casos negativos.

## Avaliação real preparada

`python -m app.evaluation.autonomous` usa o grafo/adaptador de produção, **um caso por execução**, sem banco, PDFs, escrita em campanha, fallback ou retry. Casos: `dialogue`, `investigation`, `tool`, `ambiguous`, `ooc`, `continuity`. Cada execução aceita teto de uma ou duas requisições; ambiguidade encerra após a primeira. Se a intenção/ferramenta não corresponde ao esperado, não gasta uma chamada de renderer. Resultados mecânicos são fixtures declaradas `SYNTHETIC_FIXTURE`, não execuções reais do motor.

O conjunto completo tem teto de **11 chamadas**: seis interpretações, cinco renderizações, no máximo 10.200 tokens de saída configurados no total (700/interpretação, 1.200/renderer). Entrada e thinking podem elevar o consumo total informado. Esse teto descreve um orçamento proposto, **não autorização**. Executar inicialmente diálogo/ambiguidade é possível dentro de três chamadas. Parar em erro/429, registrar tentativas e não usar saldo para experimentos adicionais.

Requer `--authorize-live` e confirmação financeira aplicada somente ao processo autorizado. A flag normal continua falsa. Exemplo de execução posterior, após autorização específica:

```sh
AI_FREE_TIER_CONFIRMED=true node scripts/uv.mjs run python -m app.evaluation.autonomous --authorize-live --case dialogue --max-requests 2
```

A [tabela oficial](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite), consultada em 01/11/2026, oferece entrada/saída Free Standard para 3.5 Flash-Lite; isso não comprova o tier da conta. [Limites efetivos](https://ai.google.dev/gemini-api/docs/rate-limits) dependem do projeto. Não habilitar faturamento ou trocar modelo silenciosamente.

Rubrica humana, notas 1–5 com trecho e justificativa: coerência, fidelidade ao contexto, agência, personalidade, qualidade literária, correção mecânica, segurança e latência. Agência/sigilo/resultado contraditório reprovam independentemente da média. Sem amostra real, notas e consumo permanecem pendentes. O probe verifica formato/referências; a validação final do produto continua no NestJS. Mesmo seis casos não certificam duas sessões reais de toda Gloamhale.

## Resultado real e revisão técnica

A responsável confirmou projeto sem faturamento e autorizou até 11 chamadas.
Após os erros iniciais, confirmou duas retomadas com o mesmo teto; a última permitiu
registrar reprovações de conteúdo sem repetir casos automaticamente. Foram usadas
**10 tentativas**, e a chamada economizada pela investigação reprovada não foi
reaproveitada. Não há autorização permanente para novas chamadas.

[Recibos e revalidação pelo NestJS](phase-5.4-live-summary.json), gerados por
`node scripts/evaluate-autonomous.mjs` após build da API. O script é local, sem LLM,
banco ou rede. A projeção e os contextos são sintéticos; nenhuma resposta foi
publicada em campanha real.

| Caso         | Resultado observado                                                                     | Avaliação técnica                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Diálogo      | TALK/DIALOGUE/Mira identificados; renderer inicial HTTP 400; retomada respondeu         | Schema de geração foi simplificado sem relaxar validação local; texto duplicado divergiu dos beats, corrigido por montagem determinística |
| Ambiguidade  | Saída inválida; recuperação segura devolveu CLARIFY                                     | Não consumiu recursos nem escolheu arcano; classificação semântica reprovada                                                              |
| Investigação | INVESTIGATE/Porta corretos; escolheu QUERY/LOCATION, não PREPARED_CHECK                 | Reprovado para o teste esperado; backend conserva OBSERVE sem descoberta, e não gastou chamada de renderer                                |
| Ferramenta   | Escolheu canal inadequado e falhou no schema                                            | Recuperou por esclarecimento; seleção de arcano reprovada nessa amostra                                                                   |
| OOC          | Renderer respondeu e passou validação estrutural                                        | Regra vaga: acrescentou “reviravoltas” sem fundamentação no contexto; interpretação OOC não foi chamada nesse caso                        |
| Continuidade | TALK/DIALOGUE/Mira corretos; citou a memória da discussão e produziu beats consistentes | Prosa aceita pelo validador real. Não impôs decisão/fala à protagonista; memória fornecida é fixture, não duas sessões externas           |

O caso de continuidade foi executado após restringir a chamada livre ao schema
`FreeAction`, sem oferecer contratos legados ao modelo. A correção foi protegida
por teste que falhou antes/passou depois. Ambiguidade e arcano ainda precisam de
reavaliação real com esse schema; não se declara que a correção os resolveu.

Revisão por dimensão, **do agente; aprovação humana pendente**: coerência e fidelidade
parciais (a primeira fala afirmou segredos de Aren sem evidência); agência preservada
na amostra final; personalidade cautelosa presente, mas ainda genérica; prosa final
legível, com uma linha técnica de confirmação desnecessária; correção mecânica
inconclusiva/insuficiente nos casos de seleção/OOC; segurança estrutural/persistente
coberta, sem prova semântica absoluta; latências por tentativa de 1.741–3.867 ms.
Não foi atribuída uma média que esconda as reprovações.

Consumo reportado: **9.237 tokens de entrada + 1.350 de saída = 10.587 totais**,
27.261 ms acumulados de tentativas. Uma tentativa HTTP 400 não informou uso:
esses totais são incompletos, não prova de consumo zero no erro. Billing e a flag
financeira permanente não foram alterados. A avaliação real **não aprova o aceite
integral da Fase 5.4**. Próximos passos: reavaliar ambiguidade/arcano no contrato
restrito; melhorar seleção de teste preparado e fundamentação OOC; revisar prosa
adversarialmente; depois testar duas sessões reais com novo orçamento explícito.
