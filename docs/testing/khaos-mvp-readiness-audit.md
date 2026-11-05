# KHAOS — Auditoria de prontidão do MVP local

**Corte:** estado do workspace em 04/11/2026, incluindo Gloamhale v5 e a entrega 5.6.3C.3. **Público:** uma jogadora local, com Naelis e Una. A unidade de sucesso é jogar, tomar decisões e retomá-las em outra sessão, com regras e continuidade verificáveis.

## 1. Resumo executivo

O KHAOS é um protótipo integrado. Já guarda fichas, ações, resultados, mensagens, objetivos, presença, revelações e posição espacial. O backend separa proposta, resolução e publicação. A v5 permite percorrer e revisitar a maior parte da mansão sem ativar encontros a cada chegada. A rodada real C.1 demonstrou uma seleção e uma publicação autorizadas em replay e foi interrompida na segunda proposta, que falhou semanticamente.

A experiência de uma campanha nova ainda tem uma dependência técnica logo na entrada: o formulário cria a instância v5, mas iniciar exige vínculo da protagonista e revisão de fichas pelo CLI. Mesmo em instância preparada, o botão de início prepara a cena sem publicar a primeira narração. A interface permite jogar um trecho assistido depois da preparação, mas falta um percurso demonstrado da criação à retomada com Gemini, e faltam respostas e consequências suficientes para seguir Gloamhale sem intervenções frequentes.

A próxima entrega de maior impacto é fechar **uma fatia jogável na interface**, da confirmação de Naelis até um pequeno objetivo, com uma conversa, uma travessia, um objeto, um teste com resultados distintos e retomada. Ela deve reutilizar o motor, o Director, o estado espacial e a publicação existentes.

## 2. Estado atual e método

| Estado | Uso neste relatório |
| --- | --- |
| Real | Exercitado com o Gemini efetivo, limitado aos requests e às publicações em replay registrados. |
| Offline | Comprovado por execução local, incluindo banco descartável, fixtures, simuladores ou navegador histórico, conforme indicado. |
| Parcial | Existe um caminho executável com cobertura funcional incompleta. |
| Manual | Um operador decide ou aciona o passo necessário. |
| Planejado | Previsto ou descrito, sem caminho executável verificado. |
| Defeito | Há divergência reproduzida ou barreira concreta no fluxo atual. |
| Não verificado | A evidência localizada é insuficiente para concluir. |

**Executado nesta auditoria:** inspeção de fontes, rotas, suites, relatórios e recibos; inventário de arquivos locais; SHA-256 somente leitura dos manifestos e arquivos vinculados; `node --test apps/web/test/*.test.mjs` no Node 24.17.0, **3 arquivos aprovados**, e `git diff --check` sem saída. Os testes web são de cliente HTTP simulado, saúde e menções; não são browser E2E. Nenhum servidor ou banco foi iniciado, nenhum build ou teste de integração foi repetido e nenhum provedor foi chamado. A pendência histórica de formatação global em 19 arquivos foi registrada na C.1 e não foi recontada.

**Evidência histórica:** C.3 registrou 50 testes de integração em três suítes NestJS com PostgreSQL descartável e IA simulada, mais 7 testes Python. A fase 5.5 exercitou o navegador com Gloamhale v3, PostgreSQL e NestJS reais e cliente de IA simulado, incluindo envio, menções e pausa/retomada. O recorte atual v5 no navegador e a disponibilidade atual de campanhas já salvas não foram verificados. [C.3](../adventures/six-of-swords/gloamhale-spatial-exploration.md) · [Navegador 5.5](phase-5.5-validation.md#verificação-no-navegador) · [Preflight histórico C.1](phase-5.6.3c-1-preflight-validation.md).

## 3. Arquitetura e integrações

| Componente | Função, conexão e efeito para a jogadora |
| --- | --- |
| Next.js | Lista, cria e edita metadados de campanhas, abre sessões e painel de jogo. Usa rewrite `/api/v1` para NestJS, sincroniza histórico/estado e envia ACT, SPEAK ou OOC, referências, opção ou habilidade. A leitura é um histórico de cartões com autor, modo, número e hora. A experiência editorial de romance contínuo está pendente. [Rewrite](../../apps/web/next.config.ts) · [Sessão](../../apps/web/src/components/session-chat.tsx) · [Ficha](../../apps/web/src/components/game-panel.tsx). |
| NestJS | Fonte de autoridade dos turnos. Registra a mensagem, controla estados da ação, chama a IA fora da resolução transacional, resolve com o motor e valida a publicação. Conecta lifecycle, contexto, mensagens, SSE/consulta e métricas. As rotas de jogo e de narração têm permissões e casos diferentes. [Controller](../../apps/api/src/narrative/narrative.controller.ts) · [Serviço](../../apps/api/src/narrative/narrative.service.ts). |
| PostgreSQL/Drizzle | Guarda definição importada, instância, cenas, fichas, ações, mensagens, eventos, relações e projeções de estado. Eventos e recibos permitem retomar e controlar repetição de ações; posição, passagens, presença e revelações sobrevivem à troca de sessão. A existência da persistência é evidência offline, ainda sem ensaio de restauração do save da jogadora. [Schemas](../../apps/api/src/database) · [Posição](../../apps/api/src/adventures/spatial.ts). |
| FastAPI/LangGraph | Recebe projeções autorizadas e oferece PROPOSE e NARRATE via contratos Pydantic. Gemini é ligado pelo SDK/roteador; NestJS também valida os dados que aceita. A execução exige serviços locais, segredo interno configurado e, para provedor real, internet e confirmação operacional. O laboratório real usou o grafo e replay NestJS, sem navegador ou campanha persistida. [Grafo](../../apps/ai-service/app/narrative/graph.py) · [Roteador](../../apps/ai-service/app/providers/router.py) · [SDK](../../apps/ai-service/app/providers/gemini.py). |
| Game Engine e Blue Rose | Calculam testes, rolagens, dano, inventário e efeitos oficiais suportados. Há combate e arcanos em recortes próprios, com controles públicos, mas isso não cobre automaticamente os encontros especiais de Gloamhale. [Motor](../../apps/api/src/game-engine/game-engine.service.ts) · [Mecânicas](../../apps/api/src/blue-rose) · [Painel](../../apps/web/src/components/blue-rose-mechanics.tsx). |
| Director e AdventureRegistry | Definições versionadas, preparação de cena, condições, evidências e critérios de progresso. v5 é padrão da criação pública; importação local sem seletor continua v1. A localização v5 pode existir sem cena; a chegada não substitui preparação e resolução de um encontro. [Registro](../../apps/api/src/adventures/registry.ts) · [Versões](../../apps/api/src/adventures/default-adventure.ts) · [Director](../../apps/api/src/adventures/director.ts) · [Preparação](../../apps/api/src/adventures/execution.ts). |
| Story Cards, contexto e memória | Índice editorial vincula fontes às identidades. O adaptador opt-in usa interlocutor presente e fontes próprias elegíveis; não ingere todos os textos autorais. Contexto usa eventos, fatos, estado e histórico selecionado, prioriza o local atual e filtra acesso. Relações armazenadas e memórias persistidas têm efeitos limitados aos consumidores implementados. [Contexto](../../apps/api/src/narrative/context.service.ts) · [Adaptador](../../apps/api/src/narrative/story-card-dialogue.ts) · [Integração editorial](../narrative/story-card-integration-review.md). |

**Percurso de um turno.** A jogadora envia pelo `SessionChat`. A rota de ações associa o pedido à mensagem original. Em v5 uma passagem selecionada ou uma intenção de movimento reconhecida pode ser autorizada deterministicamente antes de PROPOSE. Para interpretação por IA, o contexto chega ao serviço Python, que projeta as opções e devolve uma proposta. A API valida o contrato, confirma alvo e disponibilidade e executa somente um comando permitido, ou pede esclarecimento. Um teste preparado pode aguardar confirmação explícita de rolagem. Depois do commit, NARRATE recebe resolução e catálogo autorizados; o renderer verifica texto integral, autoria e referências antes da publicação. A interface sincroniza o resultado confirmado com o histórico. Erro de IA pode deixar um turno recuperável, inclusive depois de um efeito já confirmado; a recuperação deve conservar o recibo. A cadeia é sustentada por código e integrações por recorte. Falta executá-la inteira com a v5, navegador e Gemini na mesma experiência. [Resolução](../../apps/api/src/narrative/resolution.service.ts) · [Renderer](../../apps/api/src/narrative/rendering.ts) · [Testes de publicação](phase-5.6.2-validation.md) · [Integração C.3](../../apps/api/test/integration/gloamhale.spec.ts).

## 4. Matriz de funcionalidades

| Área | Estado | Interface e limites |
| --- | --- | --- |
| Selecionar campanha salva | Offline | Lista e detalhe conectados. Nenhum save real foi consultado. |
| Criar campanha/aventura | Parcial, manual | Formulário recebe título e descrição; cria Gloamhale v5 e unidades planejadas. A UI seleciona campanha por lista, sem seleção de aventura/versão na criação. |
| Preparar Naelis e party | Manual, bloqueio de UX | Presets e validação de fichas existem. `start` exige `protagonistId` e `reviewedDigest`; a primeira sessão rejeita ficha alterada após revisão. O formulário da campanha não realiza esse fluxo. |
| Ficha, inventário e equipamento | Offline, parcial | O painel permite criar e consultar fichas no recorte exposto, inventário/equipamento e testes. Criação AGE completa, escolha de protagonista para aventura e progressão autoral não estão fechadas pela UI. |
| Atributos, focos, talentos e arcanos | Offline, parcial | Há dados de ficha, validação e resolução para capacidades específicas. Campo presente na ficha não prova execução integral do talento, condição ou arcano. Curar e ações de combate têm controles dedicados; outros caminhos passam pela ação livre ou pela adjudicação. |
| Aren, Mira e Lys | Offline, parcial | Presets vigentes, referências autorais e validação. Existência mecânica e presença contextual não demonstram conversa individualizada ou decisão autônoma dos companheiros. |
| Relações e Bonds | Parcial | Persistência e consulta de relações não equivalem a Bonds/Intensity de Blue Rose nem garantem diálogos que reflitam cada mudança. |
| Iniciar, pausar e retomar | Offline, com preparo | Controles existentes. O cronômetro mede tempo ativo, sem prazo para encerrar. Primeira preparação ainda é manual. |
| Primeira narração automática | Lacuna | `start` prepara/ativa cena e muda status; a UI atualiza sessão/campanha. Não há publicação de abertura nesse caminho. O texto de abertura integra o contexto do turno posterior. |
| Histórico e continuidade | Offline, parcial | Histórico paginado e ações/eventos persistidos. Pausa/retomada preserva chat; posição, revelações e presença têm regressões v4/v5. Continuidade narrativa com modelo em múltiplas sessões ainda não demonstrada. |
| Objetivo, fim de sessão e campanha | Offline, parcial/manual | Finalização e desbloqueio existem e dependem de evidência; existem desfechos terminais. Nos capítulos posteriores, revisão de objetivos e marcos canônicos dependem do operador em diversos casos. |
| Leitura literária contínua | Parcial | Tipografia e histórico já oferecem leitura; cartões de chat, cabeçalhos de mensagem, métricas e controles dominam a página. A apresentação em prosa contínua precisa manter origem dos fatos e acesso ao recibo mecânico. |

[Campanhas](../../apps/api/src/campaigns/campaigns.service.ts) · [Revisão local](../../apps/api/src/adventures/adventure.service.ts) · [Lifecycle](../../apps/api/src/sessions/sessions.service.ts) · [Formulário](../../apps/web/src/components/campaign-form.tsx) · [Party vigente](../../apps/api/src/adventures/supplied-party.ts) · [Validação da party](../adventures/six-of-swords/party-validation.md).

## 5. Una e repertório

### Interpretação e publicação

- **Real, recorte restrito.** A 5.6.1.2 confirmou dois casos PROPOSE congelados: pergunta de memória com fonte exata e Escudo sem escolha extra. Isso não mede comandos novos ou desempenho atual no navegador. A C.1 usou três requisições reais na rodada `44d1efc1-faef-4944-89f7-18d3ad689d20`. C1-1 selecionou a réplica de Iria e publicou em replay. C1-2, “Pode explicar seu ponto sem presumir um acordo?”, recebeu DIRECT/CLARIFY, em vez de QUESTION/ANSWER, apesar de descrever corretamente o pedido. O par `disagreement/CLARIFY` foi recusado. C1-3–6 ficaram sem tentativa. Os três retornos passaram os contratos; a rodada foi reprovada semanticamente. [5.6.1.2](phase-5.6.1.2-validation.md) · [C.1](phase-5.6.3c-1-live-validation.md) · [Recibo original](../ai/phase-5.6.3c-1-live-runs/44d1efc1-faef-4944-89f7-18d3ad689d20/result.json).
- **Correção posterior, somente offline.** O MASTER recebeu instruções sobre forma interrogativa, explicação versus esclarecimento e pares disponíveis por interlocutor/assunto. A nova rodada PROPOSE `9247f347-74c4-40d5-972f-63c5f836fa6a` tem quatro casos e preflight histórico com sete testes offline. A busca pelo ID encontrou plano, manifesto e preflight, sem resultado real no repositório. O SHA-256 do manifesto continua `c257cdbead041f4a997f05ba33c39a2d1289b1188e99c0b981f34c3b6c9273cb`, mas 4 de 50 entradas divergem no workspace: `selection.py`, `context.service.ts`, `narrative.service.ts` e `story-card-dialogue.ts`. O manifesto C.1 original continua com o hash histórico `dcb2c1cf29f3189b85beec429709e9f6174d0c9e9da62e635bbbd47be9114768` e as 19 entradas de sua lista conferem. O experimento posterior exige novo snapshot compatível e autorização própria; nenhuma evidência foi regenerada. [Correção](phase-5.6.3c-1-semantic-selection-validation.md) · [Preflight](phase-5.6.3c-1-semantic-propose-preflight.md) · [Manifesto](../ai/phase-5.6.3c-1-semantic-propose-manifest.json).
- **Offline, segurança e continuidade.** Casos cobertos distinguem consulta, observação, esclarecimento, diálogo, testes e arcanos suportados. Presença, fontes próprias, modalidade HEARD, autoria, catálogo integral, agência e a regressão da galeria inventada têm evidências locais. A v5 reduz concorrência de entidades remotas no contexto, incluindo teste com 24 entidades distantes. Uma recusa correta protege a campanha, mas interrompe a interação; a qualidade da recuperação para uma jogadora real ainda precisa ser medida. [Integridade v4](../adventures/six-of-swords/gloamhale-narrative-integrity.md) · [Story Cards B.1](phase-5.6.3b-1-validation.md) · [Suite](../../apps/api/test/integration/story-card-dialogue.spec.ts).

### Narração, personalidade e repetição

A única NARRATE real da C.1 selecionou uma réplica pertinente de Iria. O preâmbulo autorizado, “Nenhuma confiança, acordo ou informação foi confirmada apenas pela tentativa”, usa linguagem operacional e prejudica o ritmo. O modelo escolheu incluir o preâmbulo; a redação veio do servidor. A réplica veio da biblioteca. Descrições de lugares e apresentação de resultados confirmados têm base determinística. Voz distinta, transições longas, variedade e mudanças relacionais ao longo de uma sessão permanecem sem confirmação humana. Os ensaios A e B usaram 58 turnos com seletores roteirizados. C.0 examinou 100 saídas autorizadas em memória e encontrou variação estreita e linguagem de auditoria. Os experimentos de Lior e de contraste Iria/Tessa não foram executados com Gemini na C.1. [A](phase-5.6.3a-validation.md) · [B](phase-5.6.3b-validation.md) · [C.0](phase-5.6.3c-0-validation.md) · [C.1, revisão literária](phase-5.6.3c-1-live-validation.md#f-avaliação-literária-qualitativa).

### Inventário do acervo

| Conjunto localizado | Uso verificável |
| --- | --- |
| 10 documentos autorais em `docs/narrative`, 3 da party e 7 NPCs, mais índice editorial e revisão | Os arquivos orientam a edição. O índice verifica identidade e proveniência; não foi localizado um loader desses arquivos no runtime. Presets estruturados e vínculos opt-in são os insumos efetivamente utilizados. |
| 1 exemplo `docs/examples/narrative-plan.json` e 1 análise de fonte `source-analysis.md`, além dos guias da adaptação | Referências locais. A preparação executável usa as definições TypeScript registradas e a persistência da instância. |
| Biblioteca G1/G2 em `dialogue-content.ts`, adaptador e fixtures/laboratórios | Recuperação contextual por interlocutor, assunto/ato, voz e elegibilidade da fonte. O renderer valida a seleção. Os ensaios A/B/C.0 medem características das saídas autorizadas; ainda não isolam contribuição em uma sessão real. |
| Acervo informado de 5 cenas de investigação, 3 de interpretação e 1 de combate | **Não verificado como conjunto de 9 documentos.** Inventário de arquivos, diretórios e busca por nomes/menções não localizaram coleção identificável com essa composição no workspace. Os documentos acima e as cenas estruturadas de Gloamhale têm finalidades distintas. Se houver acervo externo, a primeira ação é localizar as fontes e mapear seus exemplos ao catálogo, antes de produzir material duplicado. |

Para um protótipo curto, os fragmentos atuais servem se a rota e os interlocutores escolhidos tiverem cobertura conferida. Para sessões abertas, faltam réplicas por personagem, circunstância e mudança de estado, incluindo recusa, hesitação e lembrança com proveniência. Recuperar conteúdo autorizado em contexto não constitui treinamento ou memória permanente do modelo. [Índice](../narrative/story-card-editorial-index.v1.json) · [Biblioteca executável](../../apps/api/src/narrative/dialogue-content.ts) · [Exemplo](../examples/narrative-plan.json) · [Análise de fonte](../adventures/six-of-swords/source-analysis.md).

## 6. Blue Rose e Gloamhale v5

A adaptação usa o mapa e as pp. 14–24 para exploração e as pp. 6–29 para a aventura, conforme auditoria canônica anterior. O diagnóstico atual cruzou essa auditoria com a implementação v5 e os testes de integridade. A matriz mecânica inicial contém estados históricos anteriores à automação e foi usada como índice de fonte, junto à validação posterior e ao código. [PDF Six of Swords](../references/blue%20rose%20-%20six%20of%20sword.pdf) · [Auditoria canônica](../adventures/six-of-swords/gloamhale-location-audit.md) · [Matriz de regras](../adventures/six-of-swords/gloamhale-mechanical-coverage.md) · [Validação mecânica](gloamhale-mechanical-validation.md).

| Recorte | Preparado, executável e limites |
| --- | --- |
| Espaço | 21 chaves de localização. 17 localidades no grafo conectado de exploração v5, incluindo terrenos e gruta. Há cômodos sem encontro, registro de visitas, revisita e acesso persistente. Estrada, Lakesheart, pântano e acampamento mantêm fluxos preparados; transições externas imprecisas ficam sob adjudicação. |
| Restrições | Porta soterrada bloqueada; alçapões com conexões modeladas. Escada danificada, barricada, medo da subida e descoberta da trilha à gruta dependem de confirmação local. A entrada inicial espera Heroes Reborn. |
| Objetos, pistas e investigação | Fatos e elementos autorais existentes, algumas menções e opções/testes preparados. Falta cobertura acionável local → objeto → tentativa → resultado → pista. O escritório não possui investigação graduada integral. Uma menção ou descrição de objeto não garante inspeção e consequência. |
| Presença e segredos | v4/v5 persistem disponibilidade, identidade e revelações. Chant ausente fica indisponível; Erila, Eric e Bamala dependem do estado. Ilusões e segredos têm controles e regressões. Vários marcos ainda exigem confirmação local de presença ou revelação. |
| Testes e Dado de Drama | AGE 3d6, foco, alvo, grau e Dado de Drama no recorte do motor; possibilidade de rolagem autorizada pelo frontend. Sucesso/falha com consequência narrativa depende de tentativa preparada e consequência definida para aquele caso. |
| Façanhas e combate | Combate genérico, iniciativa, dano, armadura e subconjunto de façanhas têm código/testes próprios. A aventura bloqueia o combate genérico nos casos especiais; ameaça, roteiro tático, efeitos e saída precisam de regras específicas ou adjudicação. |
| Arcanos, condições e relógio | Curar e outros arcanos selecionados têm execução ou resolução parcial. Fadiga, Caído, recuperação e transformação têm recortes implementados. Transformação, tempo, transferência para gruta e ritual têm runtime de Gloamhale e comandos locais. Concentração em combate, efeitos especiais e tempo de combate/repouso no relógio exigem conferir o recorte; repousos já suportados avançam tempo conforme a validação mecânica. |
| Progressão e desfechos | Definições, objetivos, critérios e estados terminais existem. Ritual prolongado tem tarefas/limiar e consequências no runtime, ainda com operação local e limites de façanhas. Inundação, destruição, libertação e retorno à forma adulta têm fontes e caminhos de adaptação; cobertura de seus pré-requisitos, variantes e publicação ponta a ponta sem CLI não demonstrada. |

**Conclusão para a aventura inteira:** não há evidência de conclusão autônoma. Caminhos alternativos podem parar em marcos de cena, ausência de interação em um recinto visitável, pista dependente de adjudicação, condição do mapa, encontro especial ou desfecho dependente de revisão. O roteiro de seis unidades dá estrutura de progressão; o teste de uma rota espacial e o sucesso de um ritual isolado não exercitam escolhas inesperadas, falhas, recuperação e retomada até o fim. [Prontidão Six of Swords](six-of-swords-validation.md) · [Runtime](../../apps/api/src/adventures/gloamhale-runtime.ts) · [Comandos locais](../../apps/api/src/adventures/gloamhale-commands.ts).

## 7. Conteúdos e dados faltantes

| Categoria e lacuna | Dependência e fonte existente | Trabalho e bloqueio |
| --- | --- | --- |
| Narrativa: objetos, pistas, estados e condições por local | Exame interativo e escolhas consequentes dependem de IDs, perceptibilidade, ações, testes e desfechos. Usar livro, auditoria e entidades/fatos v5. | Editorial + implementação. Um objeto bloqueia A; conjunto recorrente, B; cobertura de rotas e investigação graduada, C. |
| Narrativa: cenas e revelações por evidência | Chegada, eventos e consequências precisam de vínculos verificáveis. Director, presença v4 e eventos v5 já existem. | Implementar gatilhos confirmados e preparar conteúdo. B para marcos repetidos; C para alternativas e revelações especiais. |
| Narrativa: voz, companheiros e memórias | Conversa e revisitas exigem réplicas por voz e estado, fatos próprios e modalidades. Usar os 10 cartões, G1/G2, histórico e rubrica C.0. | Curadoria autoral + testes de elegibilidade. Um NPC e um companheiro em A; variedade e reações recorrentes em B; elenco e desfechos pertinentes em C. |
| Mecânica: regras do percurso escolhido | Alvos, falha/sucesso e possíveis efeitos; usar livro AGE, fichas vigentes e motor. | Principalmente conexão e conteúdo para A; automatizar somente os efeitos recorrentes em B. |
| Mecânica: encontros, medo, transformação, gruta e ritual | Gatilhos, custos, estados e consequências auditáveis. Livro, runtime, matriz e comandos atuais são a base. | Implementação + casos canônicos. B para impedimentos comuns; C para rotas decisivas. Progressão geral, todos os arcanos e Bonds completos só bloqueiam se forem exigidos no percurso aprovado. |
| Operação: confirmar party e publicar abertura | Primeira sessão depende de protagonista e revisão válidas; ação inicial precisa aparecer no histórico. Presets, digest, plano e renderer já existem. | Conectar à experiência da jogadora, com evento idempotente. Bloqueia A sem preparação prévia. |
| Operação: verificação real, retomada e cópia de segurança | Confiabilidade entre sessões, provedor e restauração. Compose, PostgreSQL, recibos, limites e executor existentes. | Operação + validação. Teste autorizado em A, procedimento de restauração e recuperação de turno para B. |

## 8. Primeira experiência jogável

| Etapa | Funciona hoje? Evidência e intervenção |
| --- | --- |
| 1. Abrir localmente | Caminho documentado em Compose/README; navegador histórico. Nesta auditoria não se verificou a pilha ativa. Operador precisa iniciar serviços e configurar o acesso. |
| 2. Selecionar campanha | Sim no recorte offline; lista e detalhe ligados à API. Campanha nova recebe v5. |
| 3. Confirmar Naelis | Manual. Ficha pode ser consultada; vínculo/revisão exigidos pelo início não são concluídos nessa tela. |
| 4. Iniciar sessão | Sim, após preparação. Sem revisão válida, a API devolve conflito. |
| 5. Receber primeira narração | Parcial. Cena é preparada; a jogadora precisa iniciar um turno para obter publicação. Falta abertura automática segura e idempotente. |
| 6. Conversar livremente com NPC | Parcial. SPEAK e menções funcionam, com réplicas autorizadas no recorte. Seleção real falhou em C1-2; não há resposta disponível para todo pedido. Selecionar NPC/assunto cobertos no piloto. |
| 7. Explorar ambiente | Sim no recorte C.3 offline; decisão simples ou opção de passagem em ACT. Operador ainda libera condições específicas. v5 no navegador por testar. |
| 8. Examinar objeto | Parcial. Um alvo e tentativa previamente preparados podem funcionar; catálogo geral e exame contextual não demonstrados. Escolher um objeto canônico com pista e interação definida. |
| 9. Fazer teste de habilidade | Sim no recorte offline; seleção preparada e botão de rolar. Definir dificuldade e fontes antecipadamente para o piloto. |
| 10. Receber consequência | Sim se houver resolução preparada. Confirmar publicação, persistência e comportamentos de sucesso e falha, incluindo falha da IA após o commit. |
| 11. Interagir com companheiro | Parcial. A presença/ficha não garante uma conversa pertinente. Preparar uma réplica autorizada e vinculada ao estado para Aren, Mira ou Lys. |
| 12. Salvar progresso | Sim no recorte offline; persistência automática por ação confirmada. Backup/restore não testado aqui. |
| 13. Encerrar por objetivo | Parcial. A interface finaliza quando o backend indica elegibilidade; capítulos podem depender de revisão local. O piloto precisa de um objetivo atingível por evidência da jogadora. |
| 14. Retomar depois | Pausa/retomada e histórico comprovados no navegador histórico; posição comprovada em v5 offline. Testar reabrir sessão pausada e iniciar unidade seguinte após conclusão, que são operações distintas. |

**Hoje:** um ensaio assistido é plausível se houver campanha preparada, trecho já coberto e operador disponível. Uma sessão com os 14 passos, Gemini e nenhuma intervenção técnica durante a experiência ainda não está comprovada. O menor incremento é unir preparação, abertura, uma rota testada no navegador, um objeto com teste e consequência, uma réplica de NPC e outra de companheiro e um objetivo encerrável pela interface.

## 9. Bloqueadores em ordem de impacto

1. **Entrada e retorno demonstrados pela interface.** A jogadora precisa chegar à cena sem depender do CLI e reconhecer onde parou ao voltar.
2. **Percurso de jogo com resultados válidos em mais de um caminho.** Falta ligar objeto, teste, efeito e objetivo na menor fatia; depois cobrir impedimentos frequentes sem operação técnica.
3. **Confiança na Una atual.** A alteração de PROPOSE não tem confirmação real posterior. Repertório e linguagem de publicação precisam de revisão humana na fatia, preservando a fronteira 5.6.2.
4. **Gloamhale inteira.** Gatilhos e resoluções especiais, acesso externo, pistas e resultados alternativos exigem trabalho adicional. São dependências do Marco C; não precisam atrasar todo o piloto.

## 10. Roadmap priorizado

| Marco e entrega | Prioridade, escopo e dependências | Aprovação objetiva | Esforço |
| --- | --- | --- | --- |
| A — Fatia vertical local | P0. Conectar criação/confirmação de Naelis, abertura e objetivo curto; preparar diálogo e uma interação canônica com teste, travessia e companheiro. Depende dos presets, validação, renderer, v5 e seleção de percurso. | Os 14 passos observados no navegador em instalação de teste; falha e sucesso exercitados offline; pausa/retomada sem efeitos duplicados; teste com jogadora em rodada autorizada, com observações de compreensão, agência e linguagem. | 3–6 dias de implementação, 1–2 de conteúdo, 1–2 de validação. |
| B — Sessões recorrentes | P0. Ampliar objetos e gatilhos usados com frequência; melhorar leitura em prosa e separar detalhes mecânicos; ampliar vozes e reações por estado; tratar indisponibilidade, recuperar turno e restaurar save. Depende das falhas observadas em A. | Duas sessões consecutivas no mesmo save, sem CLI durante o jogo, com diálogo, escolhas e retornos; teste de restauração em cópia; nenhuma consequência duplicada nem exposição de segredo nos cenários verificados; revisão humana do texto publicado. | Mais 7–13 dias de implementação, 3–6 de conteúdo, 3–5 de validação. |
| C — Gloamhale completa | P1 após B. Cobrir transições externas pertinentes, investigação, encontros e desfechos, incluindo falha, revisita e alternativas. Reaproveitar Director, eventos v5 e runtime especial. | Travessia início–fim com jogadora sem comandos administrativos; rotas alternativas e ao menos um teste falho e um desfecho alternativo cobertos offline; retomada e critérios terminais persistidos; decisão não suportada recebe limite explícito sem inventar consequência. | Mais 12–23 dias de implementação, 6–12 de conteúdo, 5–9 de validação. |

## 11. Tempo, infraestrutura e viabilidade

Estimativa em **dias úteis de esforço**, para uma pessoa desenvolvendo com assistência de IA, disponibilidade do operador e da jogadora para validação, fontes locais acessíveis e reaproveitamento da base atual. Inclui curadoria e correções descobertas na validação; não pressupõe automação geral de Blue Rose. A pode levar **5–10 dias**. B acumula **18–34 dias**. C acumula **41–78 dias**. A agenda da jogadora, interpretação de regras, indisponibilidade do provedor e reavaliações autorizadas podem ampliar o calendário. Os intervalos são planejamento, não medições.

Para o uso local, manter PostgreSQL, NestJS, Next.js e FastAPI ativos. O volume `postgres_data` persiste dados entre reinícios normais; a remoção do volume elimina o save. O perfil de jogo sem Python ajuda no diagnóstico mecânico, mas não entrega Una. Para Gemini, internet e credencial válida são necessárias quando houver inferência. Checagem de saúde local não confirma cota nem acesso remoto. O Compose publica a web em todas as interfaces por padrão e a API em loopback; banco e Python só recebem portas no override local. Para uma jogadora na mesma máquina, manter acesso restrito à estação e conferir a exposição antes do piloto. [Compose](../../docker-compose.yml) · [Override](../../docker-compose.local.yml) · [Operação](../../README.md#início-rápido--todos-os-serviços-em-docker).

Não há requisito de GPU local para inferência remota. A máquina precisa executar navegador, Docker ou runtimes do host e os quatro processos, além de espaço para imagens, banco e cópia do save. Não há medição de RAM, CPU ou disco suficiente para fixar um mínimo; medir a pilha no computador de destino no Marco A. Para o MVP, usar backup local do PostgreSQL e ensaiar restauração em instância descartável, registrando versão da aplicação e da aventura junto ao backup. O volume persistente não cobre perda de disco ou remoção acidental.

O operador declarou projeto gratuito e faturamento desligado. Esta auditoria não conferiu credencial, quota ou faturamento. O custo de provedor depende do acesso efetivo e de seus limites vigentes. O código configura o Gemini e usa trava financeira e fallback desabilitado por padrão. O limite de 12 requisições da C.1 era orçamento experimental, sem relação comprovada com quota de sessão. Naquele replay foram reportados 7.990 tokens em três chamadas, com 6.418 ms de latência SDK somada; esse dado não prevê consumo de uma campanha. Tratar 429, indisponibilidade e espera como condições de operação e preservar o turno já confirmado. Nenhum serviço público ou adicional é necessário para o escopo local. [Configuração](../../apps/ai-service/app/core/config.py) · [Telemetria C.1](phase-5.6.3c-1-live-validation.md#h-consumo-reportado-e-latência).

## 12. Riscos

As probabilidades abaixo são julgamentos qualitativos condicionados ao escopo atual, sem inferência estatística.

| Risco | Gravidade | Probabilidade | Impacto e mitigação proporcional |
| --- | --- | --- | --- |
| CLI/adjudicação frequentes | Crítica | Alta | Interrompe início e exploração. Fechar a fatia de interface e automatizar primeiro os marcos repetidos e comprovados. |
| Continuidade após pausa, falha ou revisita | Alta | Média | Perda de confiança no save. Exercitar reabertura, efeito confirmado seguido de erro de narração e recuperação sem duplicação. |
| Conteúdo estrutural insuficiente | Alta | Alta | Cômodo visitável com poucas ações. Implementar objeto, pista e consequências em cadeia antes de ampliar mapa. |
| Seleção da IA divergente | Alta | Alta | Esclarecimento incorreto ou diálogo bloqueado. Validar com casos congelados atuais em nova rodada autorizada e no piloto, mantendo resultado semântico separado da segurança. |
| Prosa técnica, vozes genéricas e repetição | Alta | Alta | Experiência deixa de parecer romance. Revisar saídas realmente publicadas e ampliar repertório pertinente, mantendo autoria e sigilo. |
| Regras/encontros incompletos | Alta | Alta | Bifurcações ficam sem resolução. Priorizar os efeitos que mudam decisões do percurso, com regras do livro e testes de falha. |
| Backend sem UX correspondente | Alta | Alta | Jogadora precisa sair da sessão para pedir ajuda técnica. Cobrir ações críticas com navegador e mensagens acionáveis. |
| Cota/latência/indisponibilidade gratuita | Alta | Incerta | Turno não narrado ou sessão suspensa. Medir no piloto autorizado, distinguir falha pré e pós-commit e oferecer retomada explícita. |
| Regressão de sigilo ou agência | Crítica | Média | Spoiler ou decisão atribuída à jogadora. Manter testes de publicação, fontes próprias, NPC ausente e entradas sem decisão. |
| Perda do save ou exposição local | Alta | Média | Dados indisponíveis ou acessíveis na rede. Exercitar backup/restore e limitar escuta da pilha no computador alvo. |
| Complexidade e expansão prematura | Média | Alta | Aumenta manutenção antes de produzir experiência. Reusar a cadeia atual, fechar a fatia e decidir expansões a partir da observação com a jogadora. |

## 13. Recomendações finais e respostas

1. **O KHAOS já é um protótipo tecnicamente funcional? Sim.** Há fluxo integrado validado offline e resultados Gemini reais em experimentos limitados, com persistência, motor e publicação verificáveis nos respectivos recortes.
2. **Uma pessoa já consegue jogar uma sessão real pela interface? Parcialmente.** Uma campanha preparada permite um ensaio assistido. Uma sessão nova da abertura à retomada, com Gemini e sem operador técnico, ainda não foi demonstrada e tem bloqueios conhecidos.
3. **Quanto falta para sessões recorrentes sem o desenvolvedor?** Estimativa acumulada de **18–34 dias úteis de esforço**. Fechar a entrada pela UI, automatizar as ações recorrentes, revisar o repertório e demonstrar recuperação e continuidade no mesmo save.
4. **O que impede jogar Gloamhale do início ao fim?** Passagens e revelações com confirmação local, lacunas de objetos e pistas, encontros e efeitos especiais incompletos e progressão/desfechos sem comprovação ponta a ponta por caminhos distintos.
5. **Qual a próxima entrega de maior impacto?** Uma sessão curta fechada na interface, com confirmação de Naelis, abertura, diálogo, percurso, objeto com teste e consequência, objetivo e retomada. Usar o resultado com a jogadora para priorizar a ampliação.
6. **Qual a estimativa realista?** **5–10 dias úteis** para o primeiro teste, **18–34** para o MVP local e **41–78** para a primeira aventura completa, acumulados e incluindo implementação, conteúdo e validação. O critério de conclusão é a experiência observada, com os limites de segurança e continuidade mantidos.
