# Domínio da Fase 2 e preservação do histórico

A tarefa da Fase 2 concretiza o documento-base com encerramento síncrono, estados
`LOCKED`, `AVAILABLE`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, modos `SPEAK`, `ACT`,
`THINK`, `OUT_OF_CHARACTER` e roles `PLAYER`, `GAME_MASTER`, `SYSTEM`. Não introduzimos
`FINALIZING`, ações de Game Engine ou acesso local autenticado ainda: não há trabalho
assíncrono de IA a recuperar e a tarefa exclui autenticação nesta fase. O tempo depende
de pausa explícita, inclusive após fechar o navegador; inatividade será tratada depois.

Campanhas, sessões e mensagens são registros distintos, preservados no PostgreSQL com
FKs restritivas. Escritas bloqueiam campanha e sessão, nessa ordem, inclusive nos envios
por causa dos locks implícitos das FKs. Esse custo de serializar envios por campanha
simplifica a integridade e evita deadlocks; campanhas diferentes seguem independentes.
Transições fora da pré-condição retornam `409`, inclusive repetições imediatas, sem
reaplicar tempo. A consulta usa cursor exclusivo `after=sequenceNumber`, sem depender
de timestamps. O histórico confirmado não é substituído por resumo ou memória de IA.

Os contratos e garantias estão em
[Campanhas, sessões e chat persistente](../architecture/campaigns-and-sessions.md).
