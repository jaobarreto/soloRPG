# ADR 0004 — Blue Rose AGE e administração local

A Fase 3 implementa exclusivamente a edição AGE de Blue Rose. O livro brasileiro
Jambô 2023 e Six of Swords estão em `docs/references`, ignorados pelo Git. A revisão
incluiu esse material e os documentos oficiais externos. Nenhum livro é distribuído
com o código. O recorte inclui núcleo de testes, combate básico, cinco Stunts e Curar;
[pendências](../rules/blue-rose-pending-rules.md) são limites explícitos de automação.

O estado do jogo é relacional e pertence à campanha. Eventos e recibos são gravados
na mesma transação das alterações; JSONB guarda somente diffs/recibos. Escritas seguem
campanha → sessão, conservando o histórico da Fase 2. Hash e chave idempotente incluem
a audiência para impedir reutilização de recibos administrativos pelo caminho público.

Sem autenticação, capacidades privilegiadas ficam em uma CLI sem listener HTTP. O
browser recebe projeções explícitas e pode transcrever a protagonista antes de jogar.
NPCs, mundo, preparação de testes e perfis de combate exigem comandos locais. Ações
públicas usam a ficha e o contexto aprovados, sem dano ou resultados fornecidos pelo
cliente. `GM_ONLY` é filtrado em SQL; sequências visíveis independentes evitam denunciar
registros secretos por lacunas. `PLAYER_ONLY` não separa pessoas sem identidade.

Combate abre uma janela persistida de decisão de Stunts antes de confirmar dano. A
jogadora só pode resolver/recusar ou terminar turno nessa janela; os pontos restantes
são descartados. Sessão não conclui com encontro ativo. Esse estágio permite decisão
humana sem aceitar resultados mecânicos do navegador.

Migrations aditivas `0002` e `0003` preservam campanhas, sessões e mensagens existentes.
Rollback restaura binários anteriores sem apagar tabelas ou volumes. Aplicar backup,
migrations, API e web nessa ordem. Contratos e limites estão em
[Game Engine](../architecture/game-engine.md),
[Blue Rose Engine](../architecture/blue-rose-engine.md) e
[fontes/implementação](../rules/blue-rose-implementation.md).
