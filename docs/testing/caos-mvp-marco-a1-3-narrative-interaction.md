# CAOS — Validação do Marco A.1.3

**Data** 05/11/2026. Escopo de verificação da Sessão I com PostgreSQL descartável e IA simulada.

## Interface e contratos

O diário usa seis modos, com rótulo e instrução de escrita próprios. O seletor de tentativas da cena e o seletor técnico de habilidades saíram do compositor. A troca de modo conserva o rascunho de cada canal durante a edição. A escolha viaja com a mensagem, é persistida no diário e é validada pelo backend antes da interpretação.

| Modo                 | Contrato                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una                  | Esclarecimento fora da ficção. As consultas usam regras ou informações autorizadas. O diário diferencia a resposta de Una dos acontecimentos.                                                                                                                                                                                                              |
| Fala                 | Texto da protagonista, mantido no diário. Interlocução e consequências passam pelas regras de presença e pela autorização existentes. Uma fala não executa a ação física que menciona.                                                                                                                                                                     |
| Ação                 | Intenção voluntária. O backend pode reconhecer uma opção preparada pelo texto original e continua exigindo seus pré-requisitos. Outras mensagens usam a interpretação e os controles existentes.                                                                                                                                                           |
| Pensamento           | Texto privado da jogadora. O backend registra e reconhece o pensamento sem o converter em fala, ação, memória de NPC ou evidência. O texto não é enviado ao modelo nem reaproveitado no contexto de turnos posteriores.                                                                                                                                    |
| Pedir teste          | Solicita uma tentativa preparada. Sem um teste compatível e autorizado, o backend pede contexto. O pedido não escolhe dificuldade, não rola e não declara resultado.                                                                                                                                                                                       |
| Resultado de rolagem | Recebe as faces dos dois dados comuns seguidas pela face do Dado de Drama. Um teste básico visível e inequivocamente pendente pode ser resolvido com esses dados. Blue Rose calcula modificador, sucesso e pontos de façanha. Sem teste aplicável, a declaração é registrada sem efeito. O recibo identifica a origem como dados declarados pela jogadora. |

## Enviar, Continuar e recuperação

**Enviar** persiste um registro com identidade estável, modo e ordem no diário. Ele não chama Una. A mensagem aparece como **Aguardando processamento**. Recarga e pausa preservam a fila. O diário avisa se houver rascunho ainda por enviar.

**Continuar** captura a fila em um recibo com identidade própria e executa as mensagens em ordem, uma por vez, pelo lifecycle existente de proposta, resolução e publicação. Uma mensagem respondida conserva seu recibo em caso de repetição. A resolução mecânica já persistida pode ser recuperada quando falhar a publicação. Uma declaração de dados pode responder ao teste anterior mesmo com outros turnos esperando. As mensagens independentes permanecem em sua ordem original, e nenhuma delas passa à frente do teste. Cada lote tem limite de 12 mensagens e 18.000 caracteres. A interface pede que se processe o lote existente antes de adicionar mais texto. O backend não trunca mensagens.

**Continuar sem mensagens** pode publicar a primeira apresentação autorizada da cena da estrada. Depois disso, pode registrar uma espera sem evento, escolha da protagonista ou avanço de relógio. Repetir o comando sem mudança de contexto não repete a apresentação. Um teste pendente conserva sua precedência.

## Abertura autoral e montarias

A abertura integra a revisão `gloamhale-travel-a1-3-v1`, vinculada ao planejamento `gloamhale-editorial-2`. O texto conserva a redação, a pontuação e os nove parágrafos. O marcador é substituído pela identidade da protagonista confirmada no servidor. A publicação usa o validador 5.6.2 e grava sua revisão uma vez, na transação de início. A cena da carroça passa ao diário na apresentação autorizada da estrada, separada da abertura. As aberturas já registradas e as campanhas fixadas nas revisões anteriores são preservadas. A conferência do suplemento confirma as planícies de Zea e o vale de Husqan na apresentação de Gloamhale, pp. 6–7.

O livro básico de **Blue Rose AGE**, edição brasileira Jambô, **p. 335, Cavalo**, fornece os valores usados. Saúde 45, Defesa 10, Deslocamento 18 e Armadura 0. Os atributos são Combate 0, Comunicação −3, Constituição 6, Destreza 0, Força 5, Inteligência −3, Percepção 1, Precisão 0 e Vontade 1. A ficha de referência registra Potência, Corrida, Vigor, Audição e Coice, o ataque Coice +2 com dano 1d6+5 e as façanhas favorecidas Derrubar e Escaramuça. Esses dados vêm da ficha publicada, sem usar valores de outro sistema AGE.

Cada integrante selecionado recebe um cavalo com identidade própria na campanha. O cavalo tem posição, vínculo, Saúde, condições, estado de vida e estado de montaria persistidos. A abertura não cobra desgaste retroativo. A seção **Montarias** apresenta a Saúde, a localização e as condições públicas. A montaria usa os recursos e condições existentes do Game Engine. Dano adjudicado pode reduzir Saúde e causar morte. Cura autorizada usa o procedimento de Blue Rose. Morte remove a disponibilidade e não cria um substituto. Desmontar é uma ação reconhecida, e uma transição de cena preserva o cavalo no local anterior se não houver deslocamento autorizado para ele. Cavalos ficam fora das menções de interlocutores comuns.

## Compatibilidade e limites

O A.1.3 conserva os dois caminhos preparados da Sessão I, a pontuação 45 + 45 + 10, a composição opcional da party e o bloqueio de II–VII. As definições históricas v1–v5 continuam com seus digests. A migration `0013_narrative_interaction` acrescenta os modos e a tabela de vínculo das montarias. Aplicar a migration antes de iniciar a nova versão da API.

As opções preparadas são reconhecidas por frases autorizadas e aliases conservadores. Formulações sem vínculo suficiente podem pedir esclarecimento. Testes improvisados sem dificuldade aprovada, testes especiais de arcana e combate e a aplicação de consequências de encontros especiais mantêm seus procedimentos existentes. A ficha do cavalo registra o ataque e os focos oficiais para consulta. O coice como ataque executável, montar novamente, deslocar montarias entre locais e comunicação animal interativa não ganharam fluxos novos. A resolução livre de objetos e as investigações graduadas permanecem para C.4A e C.5A.

## Resultados

- **API e PostgreSQL** — 73 testes em seis suítes aprovados. A integração cobriu fila sem chamadas de IA durante Enviar, repetição concorrente, privacidade do pensamento, recuperação após falha de publicação, espera sem eventos duplicados, testes pendentes, cálculo manual de façanhas, dano, condição, cura e morte da montaria. As regressões de arquitetura, publicação 5.6.2, digests históricos e lifecycle passaram.
- **Serviço de IA** — 17 testes Python passaram com provedor simulado e cliente HTTP em memória. A primeira execução local não produziu resultado utilizável. A repetição executou o arquivo inteiro com o carregamento automático de plugins do pytest desabilitado.
- **Chromium** — dois percursos completos passaram, com zero e três companheiros. O navegador verificou os seis modos, fila persistida após recarga, Enviar sem resposta, processamento por Continuar, abertura e montarias. A rota direta e a rota da vila atingiram 100% após o encerramento e voltaram à biblioteca com II–VII bloqueadas.
- **Verificações estáticas** — build da API, tipagem, lint do recorte e `git diff --check` passaram. Os três arquivos de testes web passaram.

## Reprodução

- [Integração Gloamhale](../../apps/api/test/integration/gloamhale.spec.ts) cobre publicação, identidade, fila, dados manuais, recuperação e montarias.
- [Teste de dados declarados](../../apps/api/test/queued-interaction.spec.ts) cobre valores inválidos, Dado de Drama, sucesso e pontos de façanha.
- [Percurso Chromium](../../apps/web/e2e/campaign-opening.mjs) roda com uma base nova por composição e um simulador local de PROPOSE/NARRATE. `CAOS_TEST_COMPANIONS=0` percorre a rota direta e `3` percorre a vila.
- Foram feitas zero chamadas ao Gemini.
