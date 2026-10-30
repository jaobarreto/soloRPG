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

| Capacidade                 | Entrega e limite                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dados e testes básicos     | Implementado: 3d6 individuais, terceiro como Drama Die, modificadores persistidos, sucesso >= TN. RNG criptográfico injetável                                                                 |
| Focos                      | Onze referências; +2 normal e +3 para foco melhorado, com nível mínimo 11. Um foco por teste; posse e atributo conferidos                                                                     |
| Testes opostos             | Implementado: total, Drama Die, habilidade; empate completo fica explicitamente sem vencedor, sem desempate inventado                                                                         |
| Testes prolongados básicos | Implementado: tentativas, intervalo de jogo, soma do Drama Die de sucessos, limiar e conclusão persistentes. Não implementa competição prolongada entre vários participantes                  |
| SP                         | Calculados em testes autorizados bem-sucedidos com pares/trincas; no ataque ficam disponíveis somente para sua resolução imediata                                                             |
| Stunts                     | Cinco implementados: Golpe Poderoso (2), Perfurar Armadura (2), Derrubar (2), Postura Defensiva (2), Golpe Letal (5). Custos e efeitos do livro, uma vez por rodada                           |
| Combate básico             | Implementado no recorte a pé, todos cientes, níveis 1–2: iniciativa, turno, ações, mirar, mover, defender, levantar, recarregar, ataques e encerramento                                       |
| Equipamento de combate     | Lâmina pesada padrão, lâmina leve padrão, arco longo; dano/atributo/alcance/recarga do catálogo. Armaduras e escudos por perfil local aprovado; treinamento obrigatório                       |
| Vida e condições           | Dano validado, armadura, limite zero, morte de NPC comum, protagonista/NPC principal morrendo com prazo em rodadas, Caído persistente, bônus defensivo temporário                             |
| Descanso                   | Pausa de cinco minutos autorizada pelo operador; cura uma vez após encontro; sono de seis horas. Reseta limite de Curar e sequência de testes de fadiga                                       |
| Arcanos                    | Curar, tradição de Cura, fora de combate: conhecimento/talento, toque aprovado, teste, cura limitada, fadiga acumulativa, restrição de nova cura até pausa. Outros usos não são automatizados |
| Convicção                  | Valor inicial da protagonista por nível; gasto e recuperação por persona pendentes. NPCs não recebem Convicção automática                                                                     |
| Ficha e progressão         | Transcrição manual; não certifica distribuição de atributos, benefícios raciais, pré-requisitos ou progressão completa                                                                        |
| NPCs/mundo/eventos         | Persistentes; notas/objetivos secretos separados, alterações auditadas, estado compartilhado entre sessões                                                                                    |
| Métricas narrativas        | Extensão SoloRPG configurável; não são Relationship Bonds oficiais e não decidem comportamento                                                                                                |

No catálogo, `IMPLEMENTED` significa automação no recorte documentado, `RECORDED`
significa registro sem efeito automático, e `PENDING` indica mecânica não disponível.
Curar tem limitações explícitas em sua referência. Artificer, Knight, Body Control,
Psychic Contact e o aprendizado do talento Curar são registros; não concedem efeitos
silenciosamente. Stunts nunca podem ser associados como talentos de uma ficha.

Apenas estados de turno, proteção, fadiga e condições suportados entram nos cálculos.
Uma ficha importada pode conter outros poderes registrados, mas seus efeitos não são
adivinhados. O motor recusa combate acima do nível 2 e armas não suportadas/não
selecionadas no perfil. Consulte [pendências](blue-rose-pending-rules.md) antes de usar
cenários além desse recorte.
