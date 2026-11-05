# Adaptação e operação — Gloamhale

**Estado: adaptação assistida implementada; Fase 5 integral ainda não certificada.** Há importação e continuidade verificáveis. Encontros especiais dependem de um operador humano com o livro. O sistema bloqueia sua resolução por IA e o combate genérico nesta instância.

## Auditoria e prioridade

| Mecânica                  | Cobertura real anterior / atual                                                                                                               | Referência brasileira ou suplemento | Necessária?                                   | Prioridade / tratamento                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| Criação e atributos       | Transcrição; agora validações iniciais de grupo, nove habilidades, Saúde e pré-requisitos selecionados. Não é certificador geral.             | BR 33–51                            | Sim, quatro fichas nível 1                    | P0: revisão local obrigatória; hash invalida alterações antes do início.        |
| Povos / antecedentes      | Reconstrução específica e rastreável dos companheiros; recuperação vata automatizada. Demais benefícios e limitações registrados/adjudicados. | BR 37–44                            | Vata’an, vata’sha, noturna                    | P0: povos não concedem propriedades inventadas.                                 |
| Progressão                | Continua sem automação completa. Guard de combate acima do nível 2 permanece.                                                                 | BR 45–52                            | Aventura permite 1–4; equipe inicia em 1      | P2: nenhum aumento automático por mensagem ou sessão.                           |
| Combate básico            | Fórmulas e cinco Stunts anteriores preservados; insuficientes para os adversários especiais                                                   | BR 19–24; SoS 27–29                 | Sim, conforme escolhas                        | P0: combate da aventura exige adjudicação, sem conversão para perfil genérico.  |
| Equipamentos              | Três armas anteriores + cajado padrão, arco padrão e funda com valores fixos                                                                  | BR 54–56                            | Cajado de Naelis, arco de Mira, demais armas  | P0: catálogo de seis perfis; outras armas continuam bloqueadas.                 |
| Stunts                    | Cinco de combate; outros tipos, descontos e poderes não concluídos                                                                            | BR 23–29,75–79                      | Sim                                           | P0: não inventar efeitos; adjudicação local dos não suportados.                 |
| Arcanos                   | Curar narrativo pela tradição de Cura; demais arcanos ficam RECORDED                                                                          | BR 92–113; SoS 17–29                | Especialmente Escudo Psíquico e Segunda Visão | P0: usos não automatizados exigem consulta e adjudicação.                       |
| Fadiga / descanso         | Adicionados repouso leve de 4h com sustento, bônus vata e correção de estabilização                                                           | BR 30,42                            | Sim                                           | P0 implementado/testado no recorte; relógio narrativo não automático.           |
| Convicção, Destino, Sina  | Convicção inicial existente; gasto/recuperação por persona não concluídos                                                                     | BR cap.2                            | Sim                                           | P1: decisão e alteração local auditadas, sem autorização ao LLM.                |
| Corrupção / redenção      | Registro de recurso; mecânicas completas pendentes                                                                                            | BR cap.2; SoS 25–26                 | Potencial                                     | P1: não equiparar os orbes a aumento inventado de Corrupção.                    |
| Relationship Bonds        | Ainda sem gasto/recarga mecânica; relações de Naelis documentadas separadamente                                                               | BR 62–67                            | Sim                                           | P1: Intensity não é afinidade/confiança; não concede bônus automático de teste. |
| Surpresa / iniciativa     | Empate completo e surpresa não automatizados integralmente                                                                                    | BR 19; SoS 8,11,20                  | Sim                                           | P0: adjudicação antes de resolver encontros.                                    |
| Luz, voo e linha de visão | Perfil aberto anterior; insuficiente para espíritos e povos                                                                                   | SoS 27–29; BR 38,42                 | Sim                                           | P0: bloqueio de combate comum.                                                  |
| Montarias / perseguições  | Sem suporte completo                                                                                                                          | BR cap.1/10; SoS 10                 | Opcional                                      | P2: adjudicação, não remover cena silenciosamente.                              |
| Prolongados opostos       | Tarefas individuais e ritual coletivo específico, com estado persistido                                                                       | BR 311–312                          | Ritual é coletivo, não simples disputa        | P0: ritual específico implementado via CLI; não é suporte geral a disputas.     |
| Transformação e gruta     | Comandos locais: transformação, relógio, restauração e exceção de Saúde                                                                       | SoS 15,17,24                        | Sim                                           | P0: implementado no caminho local; exaustão mortal exige adjudicação.           |

## Fronteiras e compatibilidade

A mudança toca Game Engine (perfis/recuperação/guarda), contratos de armas, tabelas aditivas da aventura, ciclo de sessões, contexto/resolução narrativa e LangGraph. As rotas públicas existentes continuam; não há rota de administração ou Campaign Builder. Nenhuma dependência ou serviço pago foi adicionado.

`adventure_definitions` conserva a definição identificada por versão e digest; referência modificada com a mesma versão é rejeitada. `adventure_instances` associa uma campanha e uma protagonista existente revisada. Story Cards de referência estão na definição; `adventure_cast`, `adventure_memories` e `world_entities` conservam o estado jogado. `adventure_scenes` seleciona o contexto e `adventure_reviews` conserva evidências de conclusão. FKs restritivas protegem histórico e vínculos entre campanhas.

A importação é transacional e idempotente. Uma segunda execução não reinicializa mundo, NPCs ou sessões, inclusive em campanha iniciada. A primeira importação recusa campanhas iniciadas, chats existentes, planos anteriores e rascunhos incompatíveis. O processo não altera fichas existentes nem as troca por Naelis.

## CLI local reproduzível

Aplicar as migrations 0005 e 0006 antes de usar. Com pnpm no PATH:

```sh
pnpm --filter @solo-rpg/api adventure:command /tmp/adventure-command.json
```

Esta CLI abre contexto Nest sem listener HTTP. Arquivos e saídas são do operador, não da jogadora ou do LLM. O envelope completo está em `apps/api/src/adventures/adventure.service.ts`.

1. **IMPORT**: `{ "operation":"IMPORT", "campaignId":"<UUID novo ou rascunho vazio de seis sessões>", "commandId":"<UUID>" }`. Cria seis sessões se a campanha for nova; não cria personagem automaticamente.
2. **TRANSCRIBE_SUPPLIED_PARTY** é opcional e explícito: mesmo envelope, `operation` correspondente e `confirmSourceTranscription:true`. Só funciona em rascunho sem personagens; transcreve a revisão de equipe autorizada, preservando o módulo com os números originais. Não sobrescreve uma protagonista existente.
3. **STATUS**: `{ "operation":"STATUS", "campaignId":"<UUID>" }`. Informa erros, limites e `snapshotDigest`. É uma operação local privada.
4. **REVIEW_PARTY**: envelope + `expectedDigest`, `sourceReview` (justificativa), `manualRulesAccepted:true`. Requer quatro a seis integrantes, recursos iniciais compatíveis e revisão das escolhas. Não declara certificação automática de toda a criação.
5. **SCENE**: envelope + `sessionId`, `sceneKey`, `reason`; `presentCompanionIds` é opcional. Preparar antes de começar o capítulo. Durante jogo, mudar a cena requer chegada/decisão já confirmada e nenhuma ação pendente. Preparação futura não revela conteúdo à jogadora. A cena pode divergir da ordem proposta.
6. Iniciar a sessão pela aplicação. Uma instância sem protagonista revisada ou sem cena preparada recusa início. A primeira sessão também confere o digest atual de toda a equipe/equipamento.
7. Em testes/perigos ainda manuais, consultar o trecho indicado, preparar/rolar os testes oficiais e aplicar efeitos pelo Game Engine local, com motivos e IDs estáveis. LLM não recebe essa capacidade. Não publicar um ferimento ou sucesso antes de conferir os recibos.
8. **ADJUDICATE**: envelope + `sessionId`, `encounterKey`, `reason` privada, `publicSummary` explicitamente revisado, `evidenceEventIds` e `witnessKeys`. `partyWitnessIds` e `castUpdates:[{key,currentState}]` são opcionais. Só o encontro atual pode ser adjudicado. Eventos de outra campanha/sessão, testemunhas ausentes e memória coletiva de arquétipos são recusados. Falas sem teste podem ter evidências vazias, porque o operador atesta a ocorrência; isso é adjudicação humana, não prova automática pelo sistema. O resumo público entra no chat como SYSTEM; motivo e referências permanecem privados. Repetir a chave não duplica efeitos ou mensagens.
9. **REVIEW_SESSION**: envelope + `sessionId`, `reason` e uma ou mais `evidenceEventIds` confirmadas na própria sessão. Conferir os critérios narrativos e pendências. Só então o Director aceita OBJECTIVE_COMPLETED. Pausa narrativa ou pedido da jogadora continuam disponíveis sem completar objetivos.
10. Encerrar pela aplicação, preparar o próximo capítulo e iniciá-lo explicitamente. Estado, relações e memória atravessam os capítulos; consultar chats antigos permanece somente leitura.

Os comandos específicos da mansão e do ritual estão descritos em [regras locais](gloamhale-rules.md). Estado mecânico, relógio e benefícios persistem em `adventure_instances.mechanics`; nenhum desses comandos fica disponível ao LLM.

A CLI não resolve automaticamente todos os efeitos citados. Adjudicar significa uma pessoa consultar regras, conferir resultados e registrar o que efetivamente ocorreu. Quando um efeito exigir várias correções locais, guardar/reusar os IDs de cada recibo e publicar o resumo apenas após completar as etapas. Não existe transação única para um conjunto arbitrário de correções manuais.

## Atualização e recuperação

Backup verificável do PostgreSQL antes de atualizar dados reais. Ordem: migrations 0005 e 0006 → API/contratos e Python → web. As tabelas e valores de enum são aditivos; nenhuma migration anterior foi alterada. Não há down destrutivo. Para rollback, pausar a campanha, preservar tabelas/volumes e restaurar binários compatíveis; uma versão antiga não deve editar fichas com os novos perfis de armas. A reimportação nunca serve como reset.

As migrations foram verificadas no PostgreSQL descartável dos testes. O banco de desenvolvimento e campanhas reais não foram migrados/importados nesta execução. Não há verificação com provedor real sem credenciais gratuitas configuradas.

## Incremento da Fase 5.1

O [Adventure Registry](../../architecture/adventure-engine.md) conserva v1 e registra
v2 de Gloamhale. IMPORT sem seletor continua v1. Para uma campanha nova com as
capacidades novas, informar `adventureId:"six-of-swords-gloamhale", version:2`.
Não trocar a versão de uma campanha iniciada nem reimportá-la como reset.

Após transcrição opcional e revisão inicial das fichas, não é mais necessário SCENE
para iniciar cada capítulo: sua primeira cena é preparada dos dados, preservando
preparações existentes. Na v2, a jogadora pode ouvir Griseld/Amos, seguir à vila e
escolher investigar; as durações preparadas das duas conversas/decisões somam dez
minutos narrativos (política SoloRPG). Não foi inventada uma duração de viagem.
Os eventos dessas escolhas comprovam o objetivo do primeiro capítulo sem
REVIEW_SESSION. Silêncio, recusa, outro caminho e pausa continuam possíveis; não
se conclui o objetivo desse percurso sem suas evidências.

Curar em si está disponível nas cenas v2 sem bloqueios especiais. Próximas cenas,
duração e efeitos vêm do conteúdo, jamais de números escolhidos pelo modelo.
O Game Engine valida as regras e a seleção da jogadora. O relógio da mansão recebe
tempo pela infraestrutura e mantém seu estado antigo; os comandos locais de tempo
também registram os minutos rastreados da instância. O novo contador não reconstrói
tempo narrativo anterior à atualização de uma instância v1.

As demais cenas da mansão, combate e revisões subjetivas seguem assistidos. A
preparação inicial automática não resolve os blockers de um encontro. A migration
0007 é aditiva; os UUIDs históricos e o estado mecânico são preservados. A revisão
anterior ao primeiro início fica inválida quando idiomas/objetivos forem alterados,
além das alterações mecânicas já cobertas. [Matriz de autonomia e testes](../../testing/phase-5.1-validation.md).
