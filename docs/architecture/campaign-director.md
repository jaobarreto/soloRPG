# Campaign Director

Atualização da Fase 5.5: [ADR 0008](../adr/0008-sessoes-narrativas-e-progresso-confirmado.md), [menções](../adr/0009-mencoes-como-referencias-autorizadas.md), [validação](../testing/phase-5.5-validation.md).

## Autoridade e definição

O Director permanece determinístico em NestJS; não há chamada extra ao LLM. O conteúdo fica no módulo/versionamento da aventura. `adventures/progression.ts` define e avalia condições; `director.ts` recupera suas evidências e monta projeções; `state.ts` seleciona esse caminho ou o adaptador legado. O Game Engine não conhece nomes de objetivos. O contexto privado do planner recebe somente descrições/estados dos objetivos da unidade e autorização de encerramento; essa orientação não acompanha o renderer ou a interface.

`progression.units` corresponde às unidades narrativas de `definition.sessions`, sem duração obrigatória. Cada objetivo tem key estável dentro da aventura/versão/unidade, descrição interna, publicDescription opcional, tipo MAIN/OPTIONAL/CONDITIONAL/ALTERNATIVE, peso, completion, availableWhen e unavailableWhen opcionais. Estado derivado: LOCKED, ACTIVE, RESOLVED ou UNAVAILABLE. A unidade tem completion, terminal opcional e milestones para agrupar caminhos equivalentes. A última exige política terminal explícita. Consequências e rastreabilidade permanecem na definição de fatos/encounters/endings, e os IDs dos eventos provam resoluções.

Condições: FACT(reference), OPTION(sceneKey,optionKey,success), EVENT(eventType,equals opcional), ALL, ANY e SEQUENCE. Recibo OPTION exige COMMITTED/COMPLETED, resultado oficial e evento CONSEQUENCE_RECORDED da mesma campanha/sessão/comando, associado ao recibo. Falha de teste pode satisfazer OPTION com success=false; aguardar dado ou escrever uma frase não satisfaz. SEQUENCE exige ordem oficial estrita; ANY escolhe a evidência válida mais antiga, inclusive aninhada. A mesma evidência não ocupa duas posições sequenciais. Pré-requisitos e indisponibilidade são condições, sem execução de código de conteúdo.

Fatos subjetivos são atestados pela CLI `CONFIRM_FACT`: chave previamente definida, unidade ativa, motivo, fontes, eventos da mesma campanha/sessão, pré-requisitos satisfeitos e ausência de resultado exclusivo conflitante. O evento NARRATIVE_FACT_CONFIRMED é GM_ONLY; não cria mensagem, item, descoberta mecânica ou conhecimento por si só. O operador deve primeiro persistir as consequências pelos comandos apropriados. Não há inferência semântica automática de um evento arbitrário: a relação entre evidência e fato é responsabilidade da adjudicação humana explícita. REVIEW_SESSION não pode substituir essas condições em definições novas.

## Fechamento e ritmo

AVAILABLE → IN_PROGRESS ↔ PAUSED → COMPLETED. Pausar nunca libera outra unidade. Para definições novas, ambos os endpoints de conclusão exigem OBJECTIVE_COMPLETED e autorização do Director. PLAYER_REQUESTED/NARRATIVE_PAUSE não podem contornar a condição; a UI oferece Pausar sessão. Um abandono definitivo é uma resolução terminal previamente definida e atestada, não um comando para acelerar o enredo.

Sob locks campanha → sessão, conclusão verifica turnos/mecânicas pendentes, prova narrativa e condição terminal quando necessária. NARRATIVE_UNIT_COMPLETED guarda definição/unidade/evidências e indicador terminal; sessão, resumo factual, auditoria e liberação/encerramento confirmam juntos. Repetição de finalize com mesmo motivo recupera o resultado; falha de auditoria desfaz o fechamento. A próxima sessão só começa após clique, com novo chat e continuidade do mundo/memórias. Consultar um chat anterior não altera a campanha.

Tempo real, mensagens, dados, turnos e número de NPCs não entram na avaliação. Não se envia activeSeconds/targetMinutes ao planner. Espera, descanso, duração arcana e o relógio ficcional da mansão continuam conforme as políticas existentes. Director não teletransporta, força pistas, muda decisões, inventa sucessos ou revela segredos por demora.

## Progresso e privacidade

Progresso oficial da unidade = proporção ponderada de milestones satisfeitos; na ausência deles usa objetivos MAIN. Marcos devem agrupar alternativas com ANY. OPTIONAL fica fora do denominador; CONDITIONAL/ALTERNATIVE devem alimentar marcos configurados, não uma contagem bruta. Um fechamento elegível fica no máximo em 99 até persistir COMPLETED. O progresso oficial da campanha pondera as unidades; fica no máximo em 99 até confirmação terminal. As mesmas definições e provas persistidas reproduzem o resultado, sem estado numérico paralelo.

A projeção pública da sessão é 0, 50 (algum objetivo público resolvido), 90 (encerramento autorizado) ou 100 (sessão concluída). A da campanha pondera somente unidades narrativamente encerradas, com 100 reservado ao terminal. Faixas não revelam o número de marcos secretos. Só objetivos com publicDescription e disponibilidade conhecida aparecem, nunca expressões internas, chaves privadas ou IDs de eventos GM_ONLY. Estado/SSE/histórico não serializam a projeção interna. O anúncio de encerramento autorizado é público por necessidade do lifecycle, sem explicar o segredo que o habilitou.

## Compatibilidade

Gloamhale v1/v2 e campanhas sem progression mantêm o comportamento histórico: evidência de opções e/ou revisão local, além dos motivos legados de encerramento. Isso preserva saves e digests; não representa a política de criação nova. A Fase 5.5 não reinterpreta campanhas existentes, não adiciona clocks nem migra capítulos automaticamente. [Estrutura privada da v3](../adventures/six-of-swords/session-structure.md).
