# Campaign Director

O Director é uma responsabilidade determinística de `NarrativeContextService` e
do módulo de sessões; não dispara uma chamada extra de LLM por turno.

Cada plano local pode definir objetivos com `requiredOptionIds` e peso. Conclusão
exige recibos de opções bem-sucedidas COMMITTED/COMPLETED, associados a eventos
persistidos na mesma transação. Um booleano inventado pelo modelo é rejeitado pelo
schema; um teste preparado ou falho não conclui objetivo.

A progressão da sessão é a proporção ponderada dos objetivos comprovados. Não usa
quantidade de mensagens nem sessões encerradas. A sugestão de encerramento aparece
quando todos os objetivos definidos possuem evidências. Tempo ativo continua sendo
calculado pelo módulo existente, sem encerramento automático aos 120 minutos.
Replanejamento automático e marcos globais ponderados ainda não estão implementados.

`POST finalize` admite OBJECTIVE_COMPLETED apenas com evidências. A jogadora também
pode escolher NARRATIVE_PAUSE ou PLAYER_REQUESTED, preservando liberdade de desvio.
Combate ativo e turnos narrativos pendentes impedem finalizar. O endpoint não inicia
a próxima sessão automaticamente.

A finalização gera um resumo factual a partir de eventos públicos confirmados e
consolida resumo, estado COMPLETED e liberação da próxima sessão na mesma transação.
Como não há chamada externa nessa etapa, não se introduziu FINALIZING: falha no banco
reverte a finalização; repetir o mesmo encerramento recupera o resultado existente.
Resumo literário por LLM exigirá futuramente FINALIZING/checkpoint independente.

Sessão seguinte recebe resumos, mundo atual, relações e memórias pessoais. Não há
passagem automática de tempo, cura, mudança de local ou limpeza de conhecimentos.
Consultar sessão anterior não altera o capítulo atual nem sua transcrição.
