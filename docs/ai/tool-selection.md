# Seleção de ferramentas — Fase 5.6

A política atual da Una está detalhada em [seleção contextual](phase-5.6-selection.md).
QUERY recupera fontes autorizadas; OBSERVE seleciona informações perceptíveis;
PREPARED_CHECK exige tentativa de descoberta e capacidade preparada disponível.
`expression` distingue execução de perguntas, hipóteses, negações, citações e
composição. O servidor rejeita contradições sem converter arbitrariamente uma
ferramenta em outra. O LLM interpreta; os validadores e o Game Engine autorizam.
As ferramentas abaixo foram preservadas, sem novas mecânicas Blue Rose.

Na 5.6.1.1, QUESTION/DIRECT recebem instruções contrastivas no prompt de produção
e descrições espelhadas em Pydantic/Zod. QUERY é a operação de consulta, não a forma
gramatical: pergunta indireta também é QUESTION, comando de consulta pode ser
DIRECT. O backend não reclassifica a frase por palavras nem muda o recibo.

ARCANA mantém seu envelope compatível, mas um parâmetro não nulo pertencente a outro
arcano agora impede a execução com `ARCANA_PARAMETER_MISMATCH`. Ele não é descartado
para executar o restante. Identidades e contexto canônico são derivados no servidor;
parâmetros de escolha precisam ser declarados, e custos/resultados vêm do motor.
Mover Objeto/Moldar Vento não podem sobrescrever essa recusa ao vincular contexto.
O reconhecimento semântico de uma escolha aparentemente legítima ainda depende do
LLM; testes roteirizados não comprovam que ele a reconheceu na mensagem real.

Ferramentas são contratos de proposta, executados por um adaptador NestJS sob locks de campanha → sessão. Nenhuma saída bruta do modelo chega à capacidade administrativa. Toda resolução usa IDs estáveis derivados de `actionId`; auditoria, eventos e recibos mantêm as transações existentes.

| Ferramenta     | Validação / efeito permitido                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| DIALOGUE       | Interlocutor presente e inequívoco; registra fala atribuída, permite réplica livre, sem persuasão/relacionamento automáticos               |
| OBSERVE        | Apenas contexto público recuperado; nenhuma descoberta escondida                                                                           |
| QUERY          | Personagem, local, inventário, regras, memória ou objetivos; consulta sem efeitos                                                          |
| CLARIFY        | Pergunta escolhida pelo servidor; sem consumo/tempo/conhecimento audível                                                                   |
| ADJUDICATE     | Explica limite da política; nenhuma consequência inventada                                                                                 |
| PREPARED_CHECK | Nome exato de capacidade disponível com teste; TN/foco/consequências vêm do backend; aguarda dado público                                  |
| ARCANA         | Resolve ator e alvo, monta contrato existente; conhecimento, tradição, alcance, consentimento/contexto e custos são verificados pelo motor |
| COMBAT         | ATTACK/DEFEND da protagonista em encontro aprovado; motor verifica turno, ações, arma, alcance e dano; façanhas continuam pendentes        |
| REST           | Intervalo suportado pelo motor; repouso leve exige sustento; combate/condições podem impedir                                               |
| WAIT           | 1–60 minutos expressos numericamente no texto, com relógio de aventura; hook da aventura pode recusar efeitos especiais                    |

Curar em outro personagem exige contexto canônico de toque/consentimento; não se deduz consentimento do pedido. Segunda Visão conserva teste secreto/contexto autorizado; ausência de contexto não vira “não há magia”. Contato Psíquico e Controle Corporal preservam requisitos existentes. Escudo exige direção expressa. Mover Objeto/Moldar Vento só podem usar um contexto canônico único do personagem/sessão/digest da cena, sem alvo nomeado ambíguo e com parâmetros escolhidos; não há vínculo genérico entre objeto do mundo e contexto arcano. Usos fora disso permanecem sob adjudicação.

Transferir/conceder item, aplicar condição livre, alterar relação ou concluir objetivo não são ferramentas genéricas novas. Dependem das capacidades já autorizadas no plano/motor. O campo `QUERY` não concede permissão de escrita. `SCENE` e `MECHANIC` explícitos continuam compatíveis com a interface anterior. Não há SQL, `updateAnyWorldState`, criação de entidades ou execução de código.
