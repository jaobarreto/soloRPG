# Blue Rose AGE — mecânicas pendentes e limites

O livro básico está disponível localmente e foi consultado. As pendências abaixo
são **limites de implementação**, não alegação de falta de material. A fase entrega
um motor funcional delimitado; não declara cobertura integral do Core ou suplementos.
[Fontes e capacidades](blue-rose-implementation.md).

| Pendente                         | Motivo e próximo passo                                                                                                                                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criação e progressão automáticas | Ficha atual é transcrição. Implementar benefícios de povo/antecedente, escolhas de classe, pré-requisitos, Vida inicial, níveis e catálogo completo com testes                                                                                                                                     |
| Combate acima do nível 2         | Guard explícito. Completar poderes de classe, talentos e especializações antes de aceitar seus efeitos                                                                                                                                                                                             |
| Demais armas e uso não treinado  | Catálogo atual tem seis perfis de armas treinadas; não improvisa metade de dano ou propriedades desconhecidas. Ampliar tabela e regras de equipamento                                                                                                                                              |
| Demais ações                     | Carga, ataque imprudente, ajuda, levantar guarda, manter-se firme, esperar/interromper, perseguição, golpe de misericórdia e incapacitação voluntária ainda indisponíveis                                                                                                                          |
| Contextos especiais              | Montarias, voo, surpresa, combate invisível, terreno bloqueado e linha de visão não são modelados. Encontros suportados presumem participantes a pé, cientes e um plano aberto                                                                                                                     |
| Demais Stunts                    | Exploração, interação, arcanos, Escaramuça e outros Stunts de combate não implementados. Nenhum custo/efeito emprestado de outro AGE                                                                                                                                                               |
| SP fora de ataques suportados    | O gatilho pode ser registrado, mas não há saldo gastável nem efeitos para esses testes. Não acumula SP para ações futuras                                                                                                                                                                          |
| Exceções de Stunts/Bonds         | Completar descontos, SP adicionais e usos concedidos por poderes. A implementação atual limita os efeitos ao perfil básico suportado                                                                                                                                                               |
| Empate completo de iniciativa    | Total/Drama/atributo iguais impedem confirmar o encontro; não escolhemos uma ordem arbitrária. Exige adjudicação antes de automatizar esse caso                                                                                                                                                    |
| Arcanos adicionais               | Curar pela tradição de Cura também funciona no combate comum suportado. Outros seis arcanos têm usos narrativos parciais no incremento 5.2; faltam resistências, variantes, consumidores ambientais, Stunts e concentração em combate. Curar Meditativo continua pendente                          |
| Recuperação completa de fadiga   | Pausa, sono e repouso leve de quatro horas com comida/água estão suportados. Passagem automática de tempo da inconsciência não tem comando próprio. A duração sorteada é persistida, sem relógio narrativo automático. Curar agora estabiliza fadiga mortal no nível 3, inconsciente por 1d6 horas |
| Morte em tempo narrativo         | Prazo de morrendo é acompanhado em rodadas de um encontro ativo. O encerramento é rejeitado enquanto houver personagem morrendo, evitando descartar o prazo. Primeiros socorros/Convicção devem ser adjudicados localmente e corrigidos com auditoria até ganharem comandos próprios               |
| Convicção/corrupção              | Convicção inicial está calculada; gastos, recuperação por Destino/Sina, corrupção e redenção ainda não. Correções manuais exigem motivo e auditoria                                                                                                                                                |
| Relações oficiais                | Relationship Bonds/Intensity ainda não foram automatizados. Afinidade/confiança/hostilidade/medo são recursos SoloRPG, sem bônus oficiais                                                                                                                                                          |
| Testes prolongados opostos       | Tarefas básicas acumuladas estão implementadas; disputas entre várias tarefas, interrupção e falhas com consequências ficam para um incremento                                                                                                                                                     |

Condições genéricas continuam sendo anotações; só Caído e a fadiga suportada têm os
efeitos descritos no recorte. Perfil de combate e treinamento são transcritos pelo
operador local; o motor não conclui sozinho que a protagonista adquiriu um talento.
Um modificador circunstancial preparado também é uma adjudicação humana, não uma
regra inferida por texto.

A próxima fase de IA deve apenas propor comandos validados NestJS. Manter Python/
FastAPI sem acesso direto de escrita ao banco do jogo; não expor a CLI por HTTP.
Introduzir identidade/autenticação antes de ampliar acesso a pessoas ou serviços.
O recorte da Fase 3 não inclui IA. A integração restrita posterior está descrita em
[orquestração do Mestre](../architecture/ai-orchestration.md); ela não amplia o
catálogo mecânico acima. RAG semântico e embeddings continuam pendentes.

## Auditoria da Fase 5

A recuperação vata, os três novos perfis, repouso leve e a correção de estabilização foram concluídos no recorte descrito em [implementação](blue-rose-implementation.md). Não houve liberação geral de níveis superiores, armas não treinadas, classes/talentos, Arcana, Convicção, Bonds ou Stunts fora dos cinco anteriores.

Transformação infantil temporária, relógio de 1d3 horas, restauração adulta, retorno à gruta por dano e ritual coletivo de Gloamhale agora possuem comandos locais transacionais. O caminho automático do ritual exige dispensa explícita de façanhas. Benefícios, proteção e modificadores precisam de confirmação local; exaustão mortal, voos/estados especiais de espíritos, venenos e surpresa permanecem sob adjudicação. [Regras e limites exatos](../adventures/six-of-swords/gloamhale-rules.md). O motor recusa iniciar combate genérico nessa instância; Python não recebe autorização para suprir essas regras. [Matriz por prioridade](../adventures/six-of-swords/adaptation-plan.md).

Há uma divergência interna a adjudicar entre escudos por tamanho (BR p.56) e o texto do grau Novato de Estilo de Arma e Escudo (p.75). Também continuam pendentes a automação das limitações de luz dos novos povos da equipe e a certificação geral das escolhas de criação.

A integração da Fase 4 continua restrita a opções e texto confirmados. O novo contexto recupera cards e regras da cena, mas não implementa diálogo livre validado ou improvisação narrativa irrestrita. A adaptação assistida não certifica uma sessão solo autônoma com LLM real.

## Fase 5.1 — limites remanescentes explícitos

Curar em si já possui capacidade narrativa preparada. Os demais arcanos de Naelis
e dos companheiros não foram liberados pelo LLM: Escudo Psíquico precisa de oposição,
contato prévio, resistência e escolha voluntária de fadiga (BR p.102); Segunda Visão
exige alvos/assinaturas autorizados, distância, testes secretos e informações graduais
(p.113); Contato Psíquico exige familiaridade, consentimento/resistência e vínculo
persistente (pp.99–100). Controle Corporal exige efeito escolhido, tradição, toque,
consentimento e concentração (pp.100–101); Mover Objeto exige massa, linha de visão,
concentração/fadiga e variantes de resistência (p.112); Moldar Vento exige vento
atual, área, intensidade, concentração e efeitos ambientais (pp.111–112).
Nenhum desses usos recebe efeito por ser mencionado no chat.

O combate especial de Gloamhale permanece bloqueado pela aventura, com fonte e
motivo no contexto. Outra aventura não herda esse bloqueio. Ritual conserva o recorte
local com dispensa de façanhas; não há automação geral de benefícios, espíritos,
medos, posses, venenos ou efeitos sustentados. A fase melhora reutilização e ações
cotidianas preparadas, mas não certifica uma campanha completa sem operador.
