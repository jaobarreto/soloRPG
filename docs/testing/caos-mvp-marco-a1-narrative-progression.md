# CAOS — Validação do Marco A.1.2

**Data** 05/11/2026. Verificação offline da Sessão I, do catálogo e dos bloqueios editoriais.

## Implementação

O catálogo agora projeta sete sessões a partir do planejamento editorial. Só a primeira tem conteúdo operacional. As outras seis aparecem como **Bloqueada — Em preparação**, sem títulos internos, IDs de sessão ou controles de início. A API continua recusando sessões futuras mesmo após o encerramento da primeira. Os itens editoriais IV–VII não criam registros jogáveis. As reservas históricas da v5 continuam protegidas.

O planejamento versionado é gravado como um recibo privado na mesma transação que cria a nova instância da biblioteca. A revisão declara a definição compatível. Campanhas anteriores continuam com sua definição e os pesos originais, incluindo instâncias da biblioteca criadas no A.1.1. O catálogo mostra o novo índice sem migrar seus dados. A entrega usa o esquema existente, sem migração de banco.

O Director avalia os mesmos contratos de condições e recibos, com dois objetivos de 45 pontos e mais dez no encerramento regular. A abertura não concede pontos. A decisão explícita pela rota direta reconhece o contato e o rumo sem visita à vila. Uma desistência atestada tem desfecho próprio e conserva apenas os pontos percorridos. Objetivos internos futuros, a sinopse privada e o conflito central do planejamento não são incluídos no contexto de Una na nova revisão.

A seleção de Naelis, a composição opcional da party, o histórico, a abertura canônica e a fronteira 5.6.2 continuam operando como no A.1.1. A progressão não modifica o estado dos conflitos nem as regras Blue Rose.

## Resultados

- **PostgreSQL descartável** — 94 testes em sete suítes. A rodada verifica evidências da rota direta, recusa de início das seis sessões futuras, repetição de decisões e encerramento, e regressões do Director, das versões históricas e da publicação 5.6.2. O teste inicial falhou como esperado antes da implementação, pois o catálogo ainda retornava somente a sessão anterior.
- **Chromium** — quatro percursos aprovados com 0–3 companheiros. Rota direta e vila atingiram 90% antes de concluir e 100% após a gravação. Os dois percursos parciais conservaram 45% após pausa, retomada e recarga. O retorno à biblioteca conservou os seis bloqueios.
- **Compatibilidade e verificações locais** — o teste de digests históricos aprovou as cinco definições importáveis. Três arquivos de testes web, build da API, tipagem da API e da web, lint do recorte e `git diff --check` passaram.

## Evidência e autonomia

- **Automático** — contato confirmado pela opção de ouvir os moradores. Decisão confirmada pela investigação na vila ou pela rota explícita ao pântano. O encerramento regular usa a elegibilidade calculada pelo Director e preserva posição, histórico e escolhas.
- **Com ateste local** — alternativas sem opção canônica automatizada, como um recuo com consequência narrativa após um teste falho. O operador deve apontar eventos autorizados da sessão. Um resultado de dados isolado não satisfaz o critério. A desistência definitiva mantém o ateste autorizado da v5. Esses cenários de integração usam adjudicação explícita de teste, sem simular que a interface automatiza o ateste.
- **Limites** — a Sessão I pode ser percorrida sem operador pelos dois caminhos preparados. Um teste livre com desfechos fora dessas opções pode exigir ateste. A qualidade da interpretação com provedor real e a autonomia dessas situações não foram validadas. As sessões II–VII, a abertura autoral definitiva, os novos encontros, objetos, investigações graduadas e o repertório literário continuam para etapas posteriores.

## Recorte alterado e reprodução

- Planejamento e vínculo — `adventures/core/director/planning.ts`, `adventures/gloamhale/narrative-planning.ts`, registro e release, criação de campanha e leitura da instância.
- Progressão e segurança — Director, confirmação local, lifecycle, preparação de cena e contexto. O registro guarda a revisão no recibo de encerramento.
- Interface — detalhes da biblioteca, tipos da projeção pública e barra lateral do diário.
- Evidência executável — [integração Gloamhale](../../apps/api/test/integration/gloamhale.spec.ts) e [Chromium](../../apps/web/e2e/campaign-opening.mjs). O navegador usa Next.js e NestJS com PostgreSQL migrado e simulador HTTP de PROPOSE/NARRATE. Usar um banco novo por composição. `CAOS_TEST_COMPANIONS=0` percorre a rota direta, `3` percorre a vila e `1` ou `2` percorrem a retomada parcial. Para API, executar `pnpm test:integration` com Docker disponível.

[Planejamento interno e critérios verificáveis](../adventures/six-of-swords/narrative-planning-a1-2.md). Foram feitas zero chamadas ao Gemini.
