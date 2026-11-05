# Equipe fornecida e revisão autorizada

> Registro histórico da revisão de 30/10/2026. Para o preset vigente e as escolhas aprovadas, veja [Fichas da party — revisão autoral](party-authorial-review.md). As versões descritas abaixo não são alternativas ativas.

Fontes privadas: `Naelis - Ficha .pdf` (2 páginas, texto e página 1 renderizada) e `NPC_Blue Rose.pdf` (9 páginas). Os três companheiros são criações originais da campanha, não NPCs publicados com estes nomes. Os PDFs não foram editados.

## Naelis

Vata’an, adepta 1; nove habilidades 0/3/1/1/0/3/4/0/2 na ordem Combate, Comunicação, Constituição, Destreza, Força, Inteligência, Percepção, Precisão, Vontade. Saúde máxima 23 corresponde a 20 + Con 1 + resultado 2; Defesa 11 e deslocamento 11 são coerentes sem armadura. A ficha confirma +1 Comunicação e +1 Percepção como benefícios vata; subtraídos esses bônus, existe uma distribuição de 12 pontos compatível com BR p.33, mas a origem histórica dos resultados não foi fornecida e não foi inventada.

Animismo, Curar e Moldar Novatos são compatíveis com dois talentos arcanos de adepta e um de vata. A seleção contém Escudo Psíquico, Segunda Visão, Contato Psíquico, Curar, Controle Corporal, Mover Objeto e Moldar Vento, usando substituições por conhecimento repetido (BR pp.72,74,78). Medicina exige Inteligência 1 e a ficha tem 3. Conhecimento Natural combina com Povo da Floresta. O cajado de Ahri é mundano; nenhuma propriedade arcana foi atribuída.

Os Bonds informados são Ahri (Intensity 2) e mentora (Intensity 1; a ficha menciona Liora Venn). Não foram convertidos em confiança ou bônus comum: os gastos e a recuperação oficiais continuam sob adjudicação. Ahri e Liora não foram inseridas automaticamente na equipe. Destino Compassivo, Sina Desanimado, Convicção 3 e Corrupção 0 foram preservados; a validação não inventa gastos ou alterações nesses recursos.

## Ajustes autorizados dos companheiros

A responsável autorizou diversificar povos/aparências e manter coerência de classe/equipe. O sorteio, sem repetição e via `node:crypto.randomInt`, escolheu Aren vata’sha, Mira vata’an e Lys noturna. Os d6 de aparência (4,3,5) serviram de estímulo para detalhes originais; não são uma tabela oficial de aparência. Rolagens de benefícios raciais foram registradas separadamente.

As três antigas distribuições numéricas somam 12 e variam de 0 a 3. Elas foram usadas como **novas bases explícitas de compra de habilidades**, antes dos benefícios raciais. Isso é reconstrução autorizada, não uma alegação de que os PDFs antigos foram gerados dessa maneira. O código mantém `supplied-party.ts` intacto e aplica a revisão em `party-variant.ts`.

| Integrante   | Novo povo e aparência                                                                    | Benefícios / mudança explícita                                                                                                                                                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aren Valdren | Vata’sha; pele muito escura, cabelos prateados curtos, olhos violeta, cicatriz no queixo | Rolagens 6 e 9: treinamento em Lâminas Leves e foco Conhecimento Histórico. Meditativo Novato como dom vata. Mantém as habilidades e Saúde 36. Reflexos Rápidos era ilegal com Destreza 1; substituído por Estilo de Arma Única (Percepção 2). Background aldino com foco marcial adaptado, permitido por BR p.44.       |
| Mira Selwyn  | Vata’an; cabelos brancos em trança curta, olhos verde-pálidos e nós coloridos no pulso   | Rolagens 10 e 8: Persuasão e +1 Precisão, agora 4. Animismo Novato como dom vata. Povo da Floresta concede Rastrear. Saúde 30 mantida. Os focos antigos Arcos/Furtividade não foram mantidos sem uma origem legal; seu ataque com arco usa Precisão 4, sem foco Arcos.                                                   |
| Lys Varen    | Noturna; pele cinza-pálida, olhos amarelos, pequenas presas e cabelo negro grosso        | Força +1 e Vigor do povo; rolagens 8 e 2 concedem Combate +1 e Constituição +1. Finais Força 1, Combate 1, Constituição 2 e Saúde 31, mantendo o resultado operacional 4 na Saúde. Antecedente aldino concede Persuasão, cumprindo Oratória. Etiqueta/Conhecimento Cultural antigos não foram mantidos sem origem legal. |

Esses ajustes preservam papéis e personalidades, sem liderança, amizade ou romance impostos. Aren continua protetor, Mira batedora e Lys mediadora. Possuir um povo não determina alinhamento ou corrupção.

## Limites de verificação mecânica

A CLI verifica campos, grupo/nível, Saúde inicial, estado inicial, equipamento e pré-requisitos selecionados. Não automatiza todas as escolhas possíveis de criação/progressão nem os benefícios de todos os povos. Visão no escuro, reação à luz de vata’sha/noturna, dons arcanos e talentos não implementados exigem adjudicação explícita.

Há uma diferença a conferir em mesa: a tabela de escudos (BR p.56) oferece bônus por tamanho, enquanto o texto de Estilo de Arma e Escudo Novato (p.75, conferido visualmente) descreve +2 ao usar escudo. O perfil original de Aren usa escudo leve e Defesa 12. O recorte não aplicou silenciosamente uma interpretação para sobrescrever esse valor; exige adjudicação antes de combate. A instância bloqueia combate comum para não esconder essa e outras diferenças.

A transcrição é opcional e só ocorre por comando explícito em rascunho vazio. Campanhas/personagens existentes não foram migrados para estes valores. O resultado do STATUS continua `automaticallyCertified:false`; um operador deve conferir as fontes e aceitar as limitações antes de iniciar.
