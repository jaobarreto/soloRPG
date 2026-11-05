# Blue Rose AGE — implementação e fontes

Recorte `blue-rose-age-2e/0.1.0`, exclusivo à segunda edição AGE de Blue Rose.
Nenhuma regra de True20, SAGE, D&D ou de outro AGE foi importada. Consulta: 30/10/2026.

## Fontes

A fonte mecânica principal é o **livro básico brasileiro Jambô, 2023**, tradução da
edição AGE Green Ronin 2017–2019. O PDF local tem 390 páginas e os créditos identificam
a segunda edição. Está em `docs/references/blue rose livro básico.pdf`, ignorado pelo
Git; o livro e a extração temporária não são distribuídos com o código. O suplemento
`blue rose - six of sword.pdf` também está disponível, mas não foi usado para importar
novas mecânicas. A busca definitiva incluiu arquivos ignorados; os materiais locais
foram encontrados e o recorte foi ampliado antes da entrega.

As páginas citadas abaixo são **a numeração impressa brasileira**, diferente da
posição física no PDF e da edição inglesa.

| Material                                                                                                                                                                             | Uso                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Livro brasileiro pp.15–18                                                                                                                                                            | Dados, foco, teste básico/oposto, Drama Die, Convicção inicial                              |
| pp.19–24                                                                                                                                                                             | Iniciativa, ações, ataque, dano, cinco Stunts, uso imediato e repetição por rodada          |
| p.30                                                                                                                                                                                 | Vida, morte, descanso e níveis de fadiga                                                    |
| pp.48,54–57                                                                                                                                                                          | Sidestep do especialista, três armas, armaduras, escudos, Defesa                            |
| pp.69–71                                                                                                                                                                             | Focos; melhoria para +3 a partir do nível 11                                                |
| pp.92–96,101                                                                                                                                                                         | Arcanos, fadiga cumulativa e Curar pela tradição de Cura                                    |
| pp.311–312                                                                                                                                                                           | Testes avançados/prolongados e limiar de sucesso                                            |
| [Errata oficial v1.0](https://freeronin.com/age-blue-rose/GRR6501e_Blue%20Rose_TheAGERoleplayingGameOfRomanticFantasy_Errata.pdf)                                                    | Confronto com correções da edição inglesa; o bônus do especialista segue a versão corrigida |
| [Ficha AGE oficial](https://freeronin.com/age-blue-rose/Blue-Rose-AGE-Character-Sheet-fillable-2page.pdf)                                                                            | Conferência de campos e nove atributos                                                      |
| [Preview oficial 2017](https://freeronin.com/age-blue-rose/GRR6501e_Blue%20Rose_TheAGERoleplayingGameOfRomanticFantasy_Preview.pdf) e [site da linha](https://blueroserpg.com/)      | Identificação da edição e catálogo                                                          |
| [Quickstart na loja](https://greenroninstore.com/products/blue-rose-quickstart-free-pdf) e [sample autorizado](https://d1vzi28wh99zvq.cloudfront.net/pdf_previews/336274-sample.pdf) | Material auxiliar; sample apenas introdutório                                               |

A entrevista primária de Steve Kenson de 2016 e o arquivo oficial de notícias
consultados inicialmente são corroborativos. As regras finais implementadas foram
conferidas no livro local, incluindo a tabela de Stunts por inspeção visual. O índice
[FreeRonin](https://freeronin.com/) distingue AGE Blue Rose de SAGE/True20; o diretório
Dragon Age sugerido na tarefa não foi usado como substituto de regras.

## Matriz de capacidades

| Capacidade                 | Entrega e limite                                                                                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dados e testes básicos     | Implementado: 3d6 individuais, terceiro como Drama Die, modificadores persistidos, sucesso >= TN. RNG criptográfico injetável                                                                                                                                                      |
| Focos                      | Focos anteriores e referências adicionais da equipe/aventura; +2 normal e +3 para foco melhorado, com nível mínimo 11. Um foco por teste; posse e atributo conferidos                                                                                                              |
| Testes opostos             | Implementado: total, Drama Die, habilidade; empate completo fica explicitamente sem vencedor, sem desempate inventado                                                                                                                                                              |
| Testes prolongados básicos | Implementado: tentativas, intervalo de jogo, soma do Drama Die de sucessos, limiar e conclusão persistentes. Não implementa competição prolongada entre vários participantes                                                                                                       |
| SP                         | Calculados em testes autorizados bem-sucedidos com pares/trincas; no ataque ficam disponíveis somente para sua resolução imediata                                                                                                                                                  |
| Stunts                     | Cinco implementados: Golpe Poderoso (2), Perfurar Armadura (2), Derrubar (2), Postura Defensiva (2), Golpe Letal (5). Custos e efeitos do livro, uma vez por rodada                                                                                                                |
| Combate básico             | Implementado no recorte a pé, todos cientes, níveis 1–2: iniciativa, turno, ações, mirar, mover, defender, levantar, recarregar, ataques e encerramento                                                                                                                            |
| Equipamento de combate     | Lâmina pesada padrão, lâmina leve padrão, arco longo, cajado padrão, arco padrão e funda; dano/atributo/alcance/recarga do catálogo. Armaduras e escudos por perfil local aprovado; treinamento obrigatório                                                                        |
| Vida e condições           | Dano validado, armadura, limite zero, morte de NPC comum, protagonista/NPC principal morrendo com prazo em rodadas, Caído persistente, bônus defensivo temporário; Curar estabiliza fadiga mortal como inconsciente no nível 3 por 1d6 horas                                       |
| Descanso                   | Pausa de cinco minutos autorizada pelo operador; cura uma vez após encontro; repouso leve de quatro horas com comida/água para fadiga até 2; sono de seis horas. Recuperação de Saúde inclui o +2 de Constituição dos vata. Reseta limite de Curar e sequência de testes de fadiga |
| Arcanos                    | Curar, tradição de Cura, narrativo e em combate comum: conhecimento/talento, toque aprovado, teste, cura limitada, fadiga acumulativa, restrição de nova cura até pausa. Usos narrativos parciais de seis outros arcanos estão descritos no incremento 5.2                         |
| Convicção                  | Valor inicial da protagonista por nível; gasto e recuperação por persona pendentes. NPCs não recebem Convicção automática                                                                                                                                                          |
| Ficha e progressão         | Transcrição manual; não certifica distribuição de atributos, benefícios raciais, pré-requisitos ou progressão completa                                                                                                                                                             |
| NPCs/mundo/eventos         | Persistentes; notas/objetivos secretos separados, alterações auditadas, estado compartilhado entre sessões                                                                                                                                                                         |
| Métricas narrativas        | Extensão SoloRPG configurável; não são Relationship Bonds oficiais e não decidem comportamento                                                                                                                                                                                     |

No catálogo, `IMPLEMENTED` significa automação no recorte documentado, `RECORDED`
significa registro sem efeito automático, e `PENDING` indica mecânica não disponível.
Curar tem limitações explícitas em sua referência. Artificer, Knight e o aprendizado
do talento Curar continuam sendo registros. Controle Corporal e Contato Psíquico
passaram a ter os usos delimitados descritos no incremento 5.2; não concedem
efeitos fora desse recorte. Stunts nunca podem ser associados como talentos de uma ficha.

Apenas estados de turno, proteção, fadiga e condições suportados entram nos cálculos.
Uma ficha importada pode conter outros poderes registrados, mas seus efeitos não são
adivinhados. O motor recusa combate acima do nível 2 e armas não suportadas/não
selecionadas no perfil. Consulte [pendências](blue-rose-pending-rules.md) antes de usar
cenários além desse recorte.

## Incremento da Fase 5 — 30/10/2026

Foram verificados no livro brasileiro e cobertos por testes: perfis de cajado padrão, arco padrão e funda (p.54), recuperação de fadiga por repouso leve com sustento (p.30), recuperação vata (p.42) e estabilização de fadiga mortal por Curar (p.30). Receber zero de cura não estabiliza uma personagem a 0 de Saúde. Encerrar uma sessão com alguém morrendo também é recusado fora de combate.

A adaptação selecionada é The Mistress of Gloamhale Manor. [Auditoria detalhada e operação](../adventures/six-of-swords/adaptation-plan.md), [fontes](../adventures/six-of-swords/source-analysis.md), [validação](../testing/six-of-swords-validation.md). A seleção da aventura, análise e importação não tornam o motor um Blue Rose completo. O combate comum é bloqueado nesta instância, devido às exceções da casa, poderes especiais e benefícios ainda não automatizados.

Há validação estrutural e de alguns pré-requisitos da equipe, transcrição opcional da revisão autorizada dos companheiros e revisão local obrigatória antes de jogar. O retorno continua `automaticallyCertified:false`: criação/progressão gerais, Bonds, Convicção, corrupção e a maioria dos arcanos não foram concluídos.

Em 31/10/2026, foram acrescentados comandos locais de Gloamhale para transformação infantil, quatro mudanças por intervalos narrativos de 1d3 horas, restauração dos atributos e transporte à gruta com 1 de Saúde. O ritual possui progresso coletivo, três tarefas obrigatórias, benefícios individuais limitados, perigo e interrupção definitiva. O caminho automático exige dispensa explícita de façanhas; modificadores e proteção precisam de revisão local. Exaustão mortal dentro da mansão é bloqueada para adjudicação antes de Curar. [Procedimento e limites](../adventures/six-of-swords/gloamhale-rules.md).

## Fase 5.1 — separação e acesso narrativo

As guardas da mansão passaram para `adventures/gloamhale-module.ts`; combate e Curar
oficiais não importam aventuras. `blue-rose/sheet-validation.ts` contém a validação
mecânica existente de fichas; tamanho/nível do grupo vêm da definição da aventura.
Idiomas e objetivos agora participam do hash de revisão. Escolhas não são corrigidas
sem consentimento e a validação continua parcial, sem certificar toda a criação.

Curar em si pode ser escolhido por uma opção ACT preparada; o Game Engine verifica
conhecimento/talento e resolve testes, recuperação e fadiga com as mesmas regras.
Não houve criação de regras novas para os demais arcanos da ficha. Escudo Psíquico
(BR p.102), Segunda Visão (p.113), Contato Psíquico (pp.99–100), Controle Corporal
(pp.100–101), Mover Objeto (p.112) e Moldar Vento (pp.111–112) foram identificados
nas fontes locais; continuam com bloqueios explícitos nos usos não automatizados.

Durações preparadas são políticas narrativas SoloRPG e não se tornam regras oficiais.
O contador em minutos da instância é distinto do tempo ativo real e do relógio
particular da casa. Não há passagem de tempo por mensagens OOC ou pausa da jogadora.
[Escopo e evidências](../testing/phase-5.1-validation.md).
