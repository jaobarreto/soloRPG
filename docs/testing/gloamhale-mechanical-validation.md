# Validação mecânica de Gloamhale — incremento da Fase 5.2

Data: 31/10/2026. **A Fase 5.2 permanece incompleta. Este incremento não certifica autonomia dos seis capítulos.** A matriz inicial foi registrada antes de alterar as regras. [Cobertura e fontes](../adventures/six-of-swords/gloamhale-mechanical-coverage.md).

## Capacidades executadas

| Capacidade             | Execução e evidência                                                                                                                                                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Curar companheiro      | `MECHANIC/CURE` exige seleção da protagonista, alvo presente e vivo, pede dados, resolve recuperação e fadiga no NestJS. Inclui alvo morrendo; cura zero preserva a possibilidade de cura efetiva. Testes `integration/arcana.spec.ts`, `integration/gloamhale.spec.ts`, `integration/blue-rose-mechanics.spec.ts`   |
| Curar em combate comum | Exige turno, ação maior disponível e alvo a até 2 m no plano de combate já suportado. Repetição não consome novamente a ação nem rola dados. Repouso durante encontro é recusado. Não libera os combates especiais de Gloamhale                                                                                      |
| Segunda Visão          | Conhecimento e talento, foco Psíquico/Visionário, distância e escudo preparados, rolagem GM_ONLY, revelação por margem e identificação apenas de usuário conhecido. Ausência de contexto é uma recusa; não afirma que não há magia                                                                                   |
| Mover Objeto           | Massa de objeto solto à vista definida pelo backend, tabela 1–100 kg, ampliação fatigante até 1.000 kg, distância por ação calculada, falha sem efeito, fadiga cumulativa, incapacidade encerra concentração. Não implementa arremesso, criatura ou objeto disputado                                                 |
| Moldar Vento           | Teste, margem, mudança de categoria 0–3, limite de área pelo nível, efeito persistido e término voluntário. Não implementa ainda consequências ambientais, deslocamento de voadores ou modificadores de combate                                                                                                      |
| Controle Corporal      | Tradição e conhecimento reais, Meditativo somente em si, Animismo em animal e Cura em pessoa voluntária tocada; NAs corrigidos pela errata; efeitos de dormir, respiração, ignorar dor, consciência corporal e transe registrados. Consumidores de doenças/venenos, medo e recuperação acelerada não estão completos |
| Contato Psíquico       | Contato voluntário, presente, na natureza de alvo adequada à tradição; comunicação em duas vias, sem leitura de pensamentos. Contato hostil, escudo erguido, expulsão, harmonia e grito final ainda exigem adjudicação                                                                                               |
| Escudo Psíquico        | Escolha persistente de erguer/baixar, conhecimento e talento; escudo passivo não é concentração. Não automatiza ainda disputas de resistência ou decisões de fadiga para superar escudos. Não concede redução do perigo do ritual                                                                                    |
| Companheiros           | Aren usa Controle Corporal Meditativo em si; Mira estabelece Contato Psíquico com animal voluntário preparado. Conhecimento de Curar não é atribuído a Aren e arcanos não são atribuídos a Lys. Fichas aprovadas permanecem preservadas                                                                              |
| Ritual pelo Mestre     | Após preparação inicial local existente, `ADVENTURE_ACTION/RITUAL_ATTEMPT` resolve tarefa, benefício validado e perigo na mesma transação. O contrato exige dispensa explícita de façanhas e não aceita modificador. Parar é escolha explícita da protagonista e continua irreversível                               |
| Tempo de repouso       | Repouso concluído avança o relógio ficcional e o da mansão, uma vez por recibo. Transformações ocorrem antes de calcular a recuperação ao fim do intervalo. Conversas OOC e tempo real não avançam esses relógios                                                                                                    |
| Persistência           | Contextos e efeitos separados de fichas e das definições; FKs compostas por campanha, recibos e eventos atômicos. Contexto pertence ao personagem, sessão e digest do plano atual. Trocar a cena invalida massa/visibilidade/consentimento anteriores                                                                |

## Contratos e controle da jogadora

`narrativeInputSchema.mechanic` é uma escolha explícita; `MECHANIC.command` admite somente ARCANA_USE, CURE, ARCANA_END, REST e ADVENTURE_ACTION. O backend compara os objetos normalizados, sem depender da ordem das chaves no JSONB. Ações voluntárias de Naelis sem essa seleção são recusadas. NPCs presentes podem solicitar capacidades próprias. THINK/OOC não executam efeitos. O grafo Python preserva a escolha selecionada mesmo quando a cena contém outras regras ainda não automatizadas; não decide seus resultados.

Rolagens públicas ficam em AWAITING_ROLL; percepção secreta não expõe seus dados. Tentativas mecânicas ainda não roladas podem ser canceladas. Repetir uma rolagem já confirmada retorna o recibo. Erros mantêm a tentativa recuperável e não confirmam efeitos; a taxonomia completa de recusas estruturadas pedida na fase ainda está pendente.

`ARCANA_CONTEXT_SET` permanece exclusivo de composição local confiável. Não está no schema Python nem no adaptador narrativo. A IA não fornece massa, consentimento, distância, dado, dano, sucesso, dificuldade, modificador ou SQL. A interface mostra escolhas específicas em “Usar uma habilidade”, sem editor de comandos administrativos.

## Limitações que impedem o aceite da fase

1. Os perfis e as regras especiais dos Fen, haints, poltergeist, espectro e enxames ainda não foram integrados ao combate. A guarda existente de Gloamhale permanece; não foi removida para simular autonomia.
2. Não há ação Concentrar, interrupções e duração completa de efeitos em combate. Iniciar combate comum com efeito sustentado é recusado até terminar o efeito. Repouso e incapacidade encerram concentração; o escudo passivo permanece separado.
3. Contextos arcanos ainda precisam de preparação confiável. A detecção automática da fruta encantada (SoS p.18), manifestações e objetos de cada sala não foi ligada ao conteúdo versionado. O marcador de efeito sozinho não prova todos os seus consumidores.
4. O início do ritual ainda usa a preparação local existente; coleta das seis linhas, elegibilidade dos benefícios e política de proteção precisam de evidência canônica completa. Gastar Stunts no ritual continua pendente. O caminho implementado exige dispensá-los explicitamente.
5. Convicção, recompensas de Destino/Sina e Bonds/Intensity continuam pendentes. As métricas narrativas SoloRPG não concedem bônus oficiais.
6. Critérios determinísticos alternativos dos capítulos 2–6 ainda não foram implementados. A conclusão do ritual não conclui automaticamente os destinos de Erila, haints, casa e crianças. Revisões locais continuam necessárias onde já eram exigidas.
7. Rodadas de combate e durações fracionárias ainda não alimentam o relógio da mansão. Inconsciência temporária não expira automaticamente.

Esses itens são pendências de implementação, não ausência dos PDFs. A divergência de defesa de Aren com escudo/estilo e decisões de proteção do perigo continuam explícitas; nenhum bônus novo foi inventado.

## Integridade e execução

Migrations novas: 0008 (contextos/efeitos) e 0009 (vínculo do contexto à cena). Nenhuma migration anterior foi reescrita. Nenhuma migration foi executada no banco real. Definições e digests v1/v2, fichas aprovadas, campanhas e histórico foram preservados. Não houve atualização automática de instância nem criação de v3 incompleta.

Os testes usam `scripts/test-integration.mjs`, que cria PostgreSQL descartável e remove seus recursos. A IA é simulada; não houve chamada Gemini/Groq real nem alteração de faturamento. Testes simulados não demonstram qualidade narrativa real.

Resultados finais e comandos reproduzíveis serão registrados abaixo após a última regressão.
