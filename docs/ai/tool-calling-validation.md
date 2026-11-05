# Ferramentas e mecânicas — Fase 5.3

Registro histórico da Fase 5.3. Para a Fase 5.4, consulte a
[avaliação atual](narrative-evaluation.md#resultado-real-e-revisão-técnica).

01/11/2026. A IA devolve uma proposta estruturada; não executa funções administrativas,
SQL, código ou escrita direta no PostgreSQL. NestJS valida referências, seleção,
precondições e regras, confirma efeitos e só então publica o texto autorizado.

| Capacidade          | Evidência determinística/simulada                                                                             | Limite                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Teste de habilidade | SCENE preparado → AWAITING_ROLL → dados oficiais → commit → narração; retomadas concorrentes não repetem dado | Texto livre sozinho não prepara TN/foco/contexto                                  |
| Escudo Psíquico     | Escolha persistente de erguer/baixar, sem concentração                                                        | Resistência/oposição/fadiga para superar escudo pendentes                         |
| Segunda Visão       | Teste secreto; revelação por grau, dados ocultos                                                              | Requer contexto canônico preparado; ausência não prova ausência de magia          |
| Contato Psíquico    | Alvo voluntário, presente e tradição correta, comunicação em duas vias                                        | Não lê pensamentos; contato hostil/escudo/expulsão pendentes                      |
| Curar               | Conhecimento, tradição, alvo ao toque, dado, cura/fadiga/idempotência                                         | Não cria consentimento/distância por prosa; Meditativo pendente                   |
| Controle Corporal   | Conhecimento, tradição/natureza/toque, efeito selecionado e persistência                                      | Consumidores de doenças, venenos e recuperação incompletos                        |
| Mover Objeto        | Massa/visibilidade backend, rolagem, fadiga, efeito sustentado e falha                                        | Criaturas, arremesso e disputa pendentes                                          |
| Moldar Vento        | Categoria/área válidas, dado, persistência e término                                                          | Consumidores ambientais e combate pendentes                                       |
| Combate comum       | Iniciativa, ações, ataque, Defesa, dano, cinco Stunts, condições e término nas suítes Blue Rose               | Início é preparado localmente; Stunts de NPC exigem decisão explícita             |
| Gloamhale           | Ritual selecionado e perigo atômicos; transformação/relógio/continuidade                                      | Combate especial bloqueado; preparação do ritual e capítulos 2–6 ainda assistidos |

Arquivos principais: `test/integration/arcana.spec.ts`,
`test/integration/blue-rose-mechanics.spec.ts`, `test/integration/narrative.spec.ts`,
`test/integration/gloamhale.spec.ts`, testes puros Blue Rose e contratos compartilhados.
As sete capacidades foram exercitadas pela suíte existente reexecutada; não são sete
testes reais de interpretação de texto pelo Gemini. O caminho Python preserva a
mecânica selecionada mesmo em cena excepcional; backend compara comando normalizado
com a escolha da protagonista.

Os contratos recusam campos de resultado/dano, TN, modificadores e
`ARCANA_CONTEXT_SET`. THINK/OOC não executam efeitos nem propagam conhecimento.
Narração que inventa espada/vitória é substituída pela projeção; prosa não altera
inventário, Vida ou objetivos. Segredos e rolagens GM_ONLY não vão ao cliente.

Falhas cobertas: timeout, 429, modelo indisponível, resposta inválida, falha de
auditoria/mecânica, pausa durante geração, reenvio, rolagem interrompida/retomada,
resumo não persistido e perda/reconexão da entrega por consulta do registro.
Não houve simulação de queda física da rede: transporte é simulado e os testes
de persistência/reinício usam PostgreSQL real descartável.

Conclusão: ferramentas autorizadas funcionam no recorte; seleção autônoma por
linguagem livre e a campanha completa sem operador permanecem pendentes. Não foram
criadas regras para encobrir capacidades ausentes. Ver
[limites 5.2](../testing/gloamhale-mechanical-validation.md) e
[pendências oficiais](../rules/blue-rose-pending-rules.md).

O experimento real 3.5 validou conexão e uma resposta narrativa isolada, sem executar
ferramentas de jogo. A seleção real de ferramentas por linguagem livre permanece
pendente; a evidência das sete capacidades continua determinística/simulada.
