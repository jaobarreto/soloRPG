# Blue Rose AGE — mecânicas pendentes e limites

O livro básico está disponível localmente e foi consultado. As pendências abaixo
são **limites de implementação**, não alegação de falta de material. A fase entrega
um motor funcional delimitado; não declara cobertura integral do Core ou suplementos.
[Fontes e capacidades](blue-rose-implementation.md).

| Pendente                         | Motivo e próximo passo                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Criação e progressão automáticas | Ficha atual é transcrição. Implementar benefícios de povo/antecedente, escolhas de classe, pré-requisitos, Vida inicial, níveis e catálogo completo com testes                                                                                                                       |
| Combate acima do nível 2         | Guard explícito. Completar poderes de classe, talentos e especializações antes de aceitar seus efeitos                                                                                                                                                                               |
| Demais armas e uso não treinado  | Catálogo atual tem três armas treinadas; não improvisa metade de dano ou propriedades desconhecidas. Ampliar tabela e regras de equipamento                                                                                                                                          |
| Demais ações                     | Carga, ataque imprudente, ajuda, levantar guarda, manter-se firme, esperar/interromper, perseguição, golpe de misericórdia e incapacitação voluntária ainda indisponíveis                                                                                                            |
| Contextos especiais              | Montarias, voo, surpresa, combate invisível, terreno bloqueado e linha de visão não são modelados. Encontros suportados presumem participantes a pé, cientes e um plano aberto                                                                                                       |
| Demais Stunts                    | Exploração, interação, arcanos, Escaramuça e outros Stunts de combate não implementados. Nenhum custo/efeito emprestado de outro AGE                                                                                                                                                 |
| SP fora de ataques suportados    | O gatilho pode ser registrado, mas não há saldo gastável nem efeitos para esses testes. Não acumula SP para ações futuras                                                                                                                                                            |
| Exceções de Stunts/Bonds         | Completar descontos, SP adicionais e usos concedidos por poderes. A implementação atual limita os efeitos ao perfil básico suportado                                                                                                                                                 |
| Empate completo de iniciativa    | Total/Drama/atributo iguais impedem confirmar o encontro; não escolhemos uma ordem arbitrária. Exige adjudicação antes de automatizar esse caso                                                                                                                                      |
| Arcanos adicionais               | Apenas Curar pela tradição de Cura e em tempo narrativo está automatizado. Curar Meditativo, uso em combate, múltiplos alvos, sustentação e demais arcanos ficam pendentes                                                                                                           |
| Recuperação completa de fadiga   | Pausa e sono suportados; repouso leve de quatro horas e passagem automática de tempo da inconsciência não têm comandos próprios. A duração sorteada é persistida, sem relógio narrativo automático                                                                                   |
| Morte em tempo narrativo         | Prazo de morrendo é acompanhado em rodadas de um encontro ativo. O encerramento é rejeitado enquanto houver personagem morrendo, evitando descartar o prazo. Primeiros socorros/Convicção devem ser adjudicados localmente e corrigidos com auditoria até ganharem comandos próprios |
| Convicção/corrupção              | Convicção inicial está calculada; gastos, recuperação por Destino/Sina, corrupção e redenção ainda não. Correções manuais exigem motivo e auditoria                                                                                                                                  |
| Relações oficiais                | Relationship Bonds/Intensity ainda não foram automatizados. Afinidade/confiança/hostilidade/medo são recursos SoloRPG, sem bônus oficiais                                                                                                                                            |
| Testes prolongados opostos       | Tarefas básicas acumuladas estão implementadas; disputas entre várias tarefas, interrupção e falhas com consequências ficam para um incremento                                                                                                                                       |

Condições genéricas continuam sendo anotações; só Caído e a fadiga suportada têm os
efeitos descritos no recorte. Perfil de combate e treinamento são transcritos pelo
operador local; o motor não conclui sozinho que a protagonista adquiriu um talento.
Um modificador circunstancial preparado também é uma adjudicação humana, não uma
regra inferida por texto.

A próxima fase de IA deve apenas propor comandos validados NestJS. Manter Python/
FastAPI sem acesso direto de escrita ao banco do jogo; não expor a CLI por HTTP.
Introduzir identidade/autenticação antes de ampliar acesso a pessoas ou serviços.
LangGraph, provedores LLM, RAG, embeddings e narração automática não foram incluídos.
