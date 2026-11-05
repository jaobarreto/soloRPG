# Unidades narrativas de Gloamhale v3

**Material privado do Mestre.** Não distribuir ao frontend. A v3 substitui o recorte temporal somente para novas campanhas; v1/v2 e seus digests permanecem intactos.

## Fonte e decisão de adaptação

O PDF local de Six of Swords organiza a aventura em três partes: The Village (pp.7–10), The Swamp (pp.11–13) e The Manor (pp.14–26). A apresentação está na p.6; aliados/adversários nas pp.26–29 e materiais de mesa nas pp.132–133. Foram conferidos o texto dessas partes, a entrada/estrutura do solar, os sobreviventes, o ritual e os desfechos da p.26, inclusive visualmente a apresentação e a página de resoluções. A divisão em unidades segue essas partes, sem alegar que o livro as define como sessões de software.

O básico brasileiro foi consultado para preservar a distinção entre tempo de jogo real e tempo ficcional: Saúde/Fadiga e Descanso p.30 e Contato Psíquico pp.99–100 continuam exigindo suas condições. Menção não estabelece o contato nem remove duração de um efeito. PDFs privados continuam ignorados; os arquivos versionados contêm somente paráfrases estruturadas e referências.

| Unidade   | Objetivo principal e prova                                                                                                                                                                      | Opcionais/alternativas                                                                                                                                                             | Fonte impressa         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| A vila    | Relatos e decisão oficial de investigar, comprovados por recibos de ask-villagers + investigate; ou contato inicial resolvido com caminho direto ao pântano atestado localmente (village-route) | Chant e as duas cenas explicitamente opcionais não bloqueiam. A p.8 permite seguir os agressores ao pântano sem acompanhar Griseld à vila                                          | 7–10, especialmente 8  |
| O pântano | Acesso ao solar localizado por pistas/exploração confirmadas (swamp-route)                                                                                                                      | Ouvir a Mud Mother, recusar o contato ou lidar com hostilidade/consequências são caminhos distintos; contato pacífico não é requisito obrigatório                                  | 11–14                  |
| O solar   | Determinar os destinos independentes e registrar consequências oficiais (aftermath-confirmed)                                                                                                   | Documentos, resgate bem-sucedido e ritual não são exigências universais. Inundação, incêndio, ritual concluído/interrompido e permanências residuais produzem resultados distintos | 14–26, sobretudo 23–26 |

Os pesos de campanha 1/1/2 são política SoloRPG pelo escopo maior da terceira parte, sem associação a horas. Marcos do solar agrupam apuração dos sobreviventes e resolução final, sem somar todos os encontros ou quartos como obrigatórios. O plano do solar agrega os antigos capítulos 3–6 em uma única unidade, incluindo a gruta de recuperação. Exploração pode ser interrompida e retomada sem mudar de capítulo.

## Fatos, desfechos e consequências

A definição de fatos em gloamhale-v3.ts registra páginas e condições. village-route/fen-contact/fen-refusal/swamp-route representam atestações distintas. Informar fen-refusal torna indisponível o objetivo de contato pacífico, mas não impede localizar acesso. Os eventos de violência/falha não são deduzidos do texto ou automaticamente aplicados pela confirmação de um fato.

No solar, children-accounted significa destino confirmado, incluindo fracasso; não força salvar todos. haints-freed e haints-remain são exclusivos. manor-flooded, manor-burned e manor-standing são exclusivos. erila-accounted e jaymes-accounted precisam de adjudicações separadas. aftermath-confirmed exige todos esses grupos e a apuração dos sobreviventes. O ritual é opcional; um evento GLOAMHALE_RITUAL_PROGRESS só o comprova quando changes.completed=true. Completar o ritual não atesta automaticamente Erila, haints, casa ou crianças.

A p.26 diferencia a libertação dos haints, a de Erila e a destruição da casa. Inundação interrompe incidentes enquanto a área não for drenada; incêndio não resolve automaticamente todos os espíritos; interromper voluntariamente o ritual impede repeti-lo e permite recuperação futura de Jaymes. A v3 conserva essas distinções nos critérios de apuração, sem adicionar capacidades mecânicas que ainda faltam. A força motora continua nas regras/políticas existentes, e as atestações não concedem efeitos.

withdraw-village/withdraw-swamp/withdraw-manor permitem **retirada definitiva** com decisão e consequências já registradas. São política explícita SoloRPG para uma jogadora recusar/abandonar, apoiada na liberdade e consequências do cenário; o livro não publica esses IDs nem uma máquina de encerramento de campanha. Fechar por retirada confirma o terminal e deixa unidades não visitadas LOCKED, preservando o histórico. Para uma interrupção temporária, usar PAUSED.

## Adjudicação e revisão humana remanescentes

Os caminhos posteriores à vila continuam assistidos: CONFIRM_FACT exige operador, motivo, fonte e IDs de eventos oficiais da unidade. A conformidade semântica da evidência com o fato é uma atestação humana, não um classificador autônomo. O operador deve registrar separadamente consequências de destruição, resgate, espíritos e comunidades usando os comandos existentes antes de atestar o fato. Não há duas versões canônicas do objetivo nem importação automática de saves.

O livro deixa escolhas e consequências ao Narrador; não fornece predicados de software para todos os quartos/decisões. Manter revisão sobre coerência dos destinos separados, aplicação mecânica de perigos, proteção/benefícios do ritual, fichas e oposição especial. A v3 não resolve as pendências Blue Rose/5.2 ou as reprovações semânticas de 5.4. As cenas não obrigatórias não foram promovidas a requisitos para preencher três unidades.

## Histórico preservado — v1/v2

O texto a seguir descreve exclusivamente a adaptação anterior. Não é a política de novas campanhas.

# Estrutura proposta: seis sessões de aproximadamente duas horas

Esta divisão é uma adaptação SoloRPG, não uma divisão publicada no suplemento. A aventura tem três partes (vila, pântano, mansão); a terceira inclui muitas salas, perigos e revelações e foi repartida em quatro capítulos. Nenhum contador conclui acontecimentos ou começa a sessão seguinte.

Estimativa por capítulo: 10 min para retomada/decisões, 75–90 min para exploração/interação/conflitos e 20–35 min para consequências, eventual retirada e pausa. Combates demorados ou escolhas diferentes podem adiar uma cena para outro capítulo. Não há medição de uma mesa real que valide estes tempos.

## 1. A estrada e a vila — 120 min

Objetivo: Compreender a situação de Lakesheart.

Cenas possíveis: foiled-trap, fen-attack, village, chant-talk, dawning-dark, losing-chant.

Marcos: Ouvir os moradores; conhecer Chant se houver oportunidade.

Critérios: Registrar relatos obtidos e decisão sobre investigação.

Encerramentos possíveis: Permanecer na vila; seguir uma pista; recusar o chamado.

## 2. Vozes do pântano — 120 min

Objetivo: Investigar o outro lado do conflito.

Cenas possíveis: fens-beckon, mud-mother, fen-vanish, murder, harvest, rhyme, plantation.

Marcos: Ouvir os Fen; distinguir acusações e evidências.

Critérios: Registrar contato ou recusa e consequências; decidir o próximo passo.

Encerramentos possíveis: Rumo ao solar; retorno à vila; afastamento do conflito.

## 3. Os vestígios do sanatório — 120 min

Objetivo: Explorar as evidências iniciais do solar.

Cenas possíveis: reborn, parlor, piano, fruit, haints, study.

Marcos: Investigar o passado; lidar com espíritos individualmente.

Critérios: Registrar descobertas, condições e localização ao parar.

Encerramentos possíveis: Retirada; abrigo; exploração pendente.

## 4. A casa e seus perigos — 120 min

Objetivo: Lidar com as manifestações da casa.

Cenas possíveis: kitchen, feast, master.

Marcos: Identificar perigos e possíveis recursos de ajuda.

Critérios: Registrar efeitos em vigor, objetos e decisões.

Encerramentos possíveis: Pausa segura; retorno à gruta; seguir ao andar superior.

## 5. Vozes e sobreviventes — 120 min

Objetivo: Investigar o andar superior e procurar sobreviventes.

Cenas possíveis: erila, toys, attic.

Marcos: Contato com Erila quando cabível; localizar crianças e brinquedos.

Critérios: Registrar conhecimentos individuais, resgate e decisões sobre os espíritos.

Encerramentos possíveis: Evacuação; preparação; investigação incompleta.

## 6. Escolhas e consequências — 120 min

Objetivo: Decidir como enfrentar a assombração.

Cenas possíveis: ritual, resolution.

Marcos: Avaliar ritual e alternativas; resolver consequências sustentadas.

Critérios: Registrar separadamente destino da casa, crianças, haints, Erila e Jaymes.

Encerramentos possíveis: Banimento; interrupção; inundação; incêndio; retirada.

A CLI SCENE pode preparar qualquer cena da aventura no capítulo adequado à ficção, com motivo explícito. Os planos sugeridos não são uma ordem obrigatória. REVIEW_SESSION exige eventos persistidos e uma conferência local dos critérios; não permite que o LLM declare sucesso. NARRATIVE_PAUSE e PLAYER_REQUESTED preservam objetivos pendentes e todo o histórico.

Títulos futuros públicos são apenas “Sessão N”. Objetivos e opções de capítulos LOCKED não são expostos.
