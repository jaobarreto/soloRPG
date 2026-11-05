# KHAOS — Fase 5.6.3B: réplicas contextuais e vozes autorizadas

02/11/2026. Recorte **G1/G2**, executado offline. Zero chamadas Gemini/Groq;
nenhum orçamento anterior reutilizado. Revisão literária identificada como
avaliação do agente sobre transcritos roteirizados, sem aprovação humana ou
certificação do Gemini. Não se iniciou a próxima intervenção nem a Fase 5.7.

## A. Diagnóstico arquitetural

Leitura de referência: [5.6.3A](phase-5.6.3a-validation.md),
[5.6.2](phase-5.6.2-validation.md), ADRs 0007/0010/0011, renderer, contexto,
Story Cards, memória individual, contratos Pydantic/Zod, persistência de falas,
corpus de 58 turnos, métricas e rubrica versionada da etapa A.

Causa observada: `publicationChoices` oferecia três falas genéricas sem memória
por interlocutor; personalidade alterava apenas a abertura. Motivação, estado e
speech não acrescentavam conteúdo. Conhecimento próprio permitia citações
integrais, mas não respostas preparadas sobre o assunto da pergunta. A cautela
acabava formulada como suspeita mesmo em perguntas sobre desacordo. Isso é
limitação comprovada do repertório, não prova de incapacidade do Gemini.

Pontos de extensão: conteúdo preparado → filtragem em `NarrativeContextService`
→ catálogo recomposto → seleção NARRATE → validação integral transacional →
persistência da fala publicada. A interpretação também precisava de um seletor
opcional de assunto/ato: confiar na correspondência por palavras-chave criaria
um parser paralelo. O modelo propõe esses seletores; o servidor verifica sua
disponibilidade, sem lhes dar autoridade sobre fatos ou efeitos.

Hipótese ainda não medida: com respostas pertinentes disponíveis e instruções
de seleção, o modelo real conseguirá escolhê-las. Todo seletor desta avaliação
foi roteirizado. Autorização determinística funciona independentemente dessa
hipótese; seleção ruim continua podendo produzir uma fala genérica autorizada.

## B. Modelo de conteúdo e versionamento

[Modelo completo](../ai/contextual-dialogue.md). Biblioteca server-owned
`khaos-dialogue/v1`: **34 fragmentos**, 17 por voz, quatro assuntos e oito atos.
Cada fragmento tem identidade estável, versão, perfil, assunto, ato, requisitos,
texto e autoria. O vínculo local explicita personagem, voz, estado esperado,
escopo, referências/digests exatos e autoria da preparação.

Reutilizou-se `scenePlan.dialogue`, opcional, no JSONB existente. Não há tabela,
migração ou reimportação. Conteúdo reutilizável vive no módulo da biblioteca;
IDs e descrições específicos vivem na preparação local. Nada depende de
Gloamhale. Só o caminho de personagens regulares recebe vínculos nesta v1;
Story Cards instanciados mantêm seu caminho anterior. Preparar seu adaptador é
pendência explícita, sem autorização automática pelo nome do card.

Conteúdo v1 em uso não deve ser alterado silenciosamente: mudança exige versão
explícita e revisão de compatibilidade. Versões desconhecidas e aliases/vínculos
ambíguos não disponibilizam réplicas. Não há defaults novos nos planos antigos.

## C. Alterações implementadas

| Arquivo                                                                                               | Finalidade                                                                             |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/shared-contracts/src/dialogue.ts` (novo)                                                    | Vínculo/proveniência estritos, atos, assuntos e tipos de menu                          |
| `packages/shared-contracts/src/{narrative,free-action,index}.ts`                                      | Preparação opcional e seletores DIALOGUE, exports                                      |
| `apps/api/src/narrative/dialogue-content.ts` (novo)                                                   | Biblioteca, renderização integral e autorização por requisitos                         |
| `apps/api/src/narrative/context.service.ts`                                                           | Fontes da campanha/ator atual, menu filtrado e reconstrução de réplicas                |
| `apps/api/src/narrative/free-action.ts`                                                               | Validação pelo ID resolvido e esclarecimento de seleção indisponível                   |
| `apps/api/src/narrative/resolution.service.ts`                                                        | Guarda o seletor validado; não altera resolução de fala/efeito                         |
| `apps/api/src/narrative/rendering.ts`                                                                 | Acrescenta beats autorizados; impede combinação de alternativas; proveniência          |
| `apps/api/src/narrative/narrative.service.ts`                                                         | Persiste proveniência somente da fala final validada                                   |
| `apps/api/src/messages/dto/message-response.dto.ts`                                                   | Oculta metadados internos novos do chat                                                |
| `apps/ai-service/app/narrative/{schemas,selection,prompts}.py`                                        | Espelho estrito, menu mínimo e orientação de seleção                                   |
| `packages/shared-contracts/openapi/ai.json`                                                           | Exportação local do schema real, sem iniciar servidor/provedor                         |
| `apps/api/test/dialogue-content.spec.ts` (novo)                                                       | Unidade/autorização/composição/contrato entre runtimes                                 |
| `apps/api/test/integration/phase563b-lab.spec.ts` (novo)                                              | 58 turnos e cinco controles dirigidos adicionais                                       |
| `apps/ai-service/tests/test_contextual_dialogue.py` (novo)                                            | Wire/SDK simulado/projeção de mínimo privilégio                                        |
| `packages/shared-contracts/test/dialogue.test.cjs` (novo)                                             | Compatibilidade e campos proibidos                                                     |
| `apps/ai-service/app/evaluation/contextual_dialogue.py` e `tests/test_dialogue_comparison.py` (novos) | Comparação reproduzível; rejeita histórico ou inputs alterados                         |
| Documentação/artefatos B e registro de testes                                                         | Evidências novas, sem sobrescrever a etapa A                                           |
| `apps/api/test/integration/phase55.spec.ts`                                                           | Ordena as duas consultas do teste por eventId; mantém igualdade integral dos registros |

Os dois NPCs sintéticos têm personalidade, motivação pública, estado explícito e
memória individual. Iria reservada e Tessa acolhedora respondem ao mesmo assunto
no teste dirigido; cada uma tem fonte própria de um conflito em que participou. No corpus comparativo,
Tessa conserva o limite original: não presenciou o desacordo de Iria e Naelis.
Seu perfil acolhedor não concede confiança, perdão ou ajuda.

## D. Autorização e proveniência

As fontes são relidas na campanha corrente. Memória exige propriedade do ator,
visibilidade PUBLIC, modalidade/tipo de evento esperados e digest da descrição.
Falas de conflito próprio exigem ainda participação do interlocutor no evento;
ser testemunha de uma discussão alheia não basta. A revisão dos exemplos
identificou essa lacuna intermediária: dois novos casos negativos falharam antes
da exigência de participação e passaram depois. O teste das vozes passou a
preparar uma discussão própria para cada NPC. A associação semântica continua
sob autoria local; participação registrada também não prova o significado de
qualquer descrição arbitrária.
Descrição de entorno exige PUBLIC e acesso atual. Presença, identidade e estado
também são condições atuais; não se extrai estado de frases. O desacordo exige
`UNRESOLVED`; a promessa exige `HEARD/SPEECH_RECORDED` e permanece citação de
fala. Nenhuma resposta executa auxílio, confirma acusação ou reconciliação.

A revisão de autoria local associa fonte e assunto. O SHA-256 prova a identidade
do conteúdo; não prova seu significado. `reviewed: true` é declaração do
preparador confiável, não revisão humana automática nem assinatura criptográfica.
Os textos desta entrega foram escritos/revisados pelo agente. FREE não aceita
texto, biblioteca, fontes, estado ou efeitos no objeto DIALOGUE.

Revalidação ocorre na transação já usada pela publicação. O teste altera o
estado após NARRATE e antes dessa transação: o texto preparado sai do catálogo,
é rejeitado por `UNAPPROVED_SEGMENT` e não chega ao chat ou à memória.
Proveniência inclui conteúdo e vínculo, referências e hashes; é persistida
atomicamente para a fala final e escondida no DTO público.

## E. Integração Python/NestJS e preservação da 5.6.2

PROPOSE recebe somente nomes e pares disponíveis de `topic/act`. NestJS verifica
o par completo no menu do ID resolvido. Se não houver conteúdo, CLARIFY limita
a resposta; omissão dos seletores preserva o caminho legado. Não há normalização
de seleção errada para resposta correta.

NARRATE continua com o mesmo schema estrito de beats. O modelo escolhe texto
integral, `speakerId` e `factIds`; NestJS recompõe o catálogo atual e exige
igualdade completa. Uma réplica contextual é uma fala completa: exatamente um
beat DIALOGUE quando há seleção contextual. Duas alternativas isoladamente
autorizadas são recusadas juntas (`DIALOGUE_ALTERNATIVES`). Isso acrescenta uma
restrição de publicação, sem G3/planejamento editorial. O resultado mecânico
oficial continua literal e obrigatório, com os limites anteriores.

Persistência, HEARD, eventos e idempotência continuam nos fluxos anteriores.
Fallback usa conteúdo seguro do catálogo atual, nunca o fragmento rejeitado.
Permanece a regressão da galeria secreta inventada. Paráfrases, fontes privadas,
fatos de outro ator, agência inventada e resultados contraditórios não passam.

Pydantic/Zod aceitam seletores opcionais equivalentes e recusam extras. A suíte
encontrou uma incompatibilidade intermediária: Python serializava os novos
campos ausentes como `null`. Foi corrigido somente o wire desses campos
opcionais; a fixture histórica ficou intacta. Valores presentes não são
descartados nem corrigidos. API/contratos devem ser atualizados antes de um
Python que envie seletores novos; API antiga estrita pode recusá-los. Históricos
e planos sem o recurso continuam legíveis e reproduzíveis.

## F. Resultados de testes

Antes da implementação, os quatro testes iniciais falharam: seletores e vínculo
não eram aceitos, a réplica não entrava no catálogo e não havia a política de
composição contextual. Depois, a suíte inclui **18 testes** de conteúdo/contrato.
Não foram afrouxados gabaritos de fases anteriores.

| Validação final                                                  | Resultado                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| NestJS, unidades + integrações + todos os laboratórios           | **484/485**, 33 suítes, 497,85 s; suíte afetada reexecutada **10/10**            |
| Cobertura NestJS global                                          | statements 92,55%; branches 84,55%; functions 96,63%; lines 94,00%               |
| Biblioteca de conteúdo                                           | lines 100,00%; branches 95,34%                                                   |
| Python completo, incluindo comparador                            | **359/359**, 10,04 s; cobertura global 86%                                       |
| Contratos compartilhados                                         | **14/14**, 6 arquivos, 253 ms                                                    |
| Laboratório B após captura dos controles publicados              | **18/18**, incluídos na execução completa; 58 turnos + cinco controles dirigidos |
| Typecheck/build/lint API e shared; Ruff/check-format/Mypy Python | Passaram                                                                         |

Ocorrências intermediárias preservadas: uma execução B teve 16 acertos/2 falhas
porque a fixture mantinha Tessa ausente na primeira sessão dos controles novos.
Foi corrigida **a preparação desses controles**, com presença explícita; o corpus
comparativo continua com a presença original. O wire legado apresentou a falha
real de `topic:null/act:null` descrita em E; a correção preservou a fixture antiga.
Uma execução suplementar de Jest dentro do sandbox falhou em 11 testes por
`listen EPERM`/subprocessos Python sem conclusão. A execução completa com portas
locais permitidas validou 484 casos; a falha de ordenação foi corrigida e a suíte afetada passou em 10/10. Não se desativou nenhum teste para
obter aprovação. Logs transitórios: `/tmp/khaos563b-red.log`,
`/tmp/khaos563b-lab-test.log`, `/tmp/khaos563b-python-final.log`,
`/tmp/khaos563b-api-unit-final.log`, `/tmp/khaos563b-api-final4.log`,
`/tmp/khaos563b-python-final3.log`, `/tmp/khaos563b-lab-final.log` e
`/tmp/khaos563b-shared-verified.log`. A ampliação de participação também tem o ciclo
vermelho/verde em `/tmp/khaos563b-participation-{red,green}.log` e cinco controles
de integração em `/tmp/khaos563b-participation-integration.log`. Um erro
intermediário de compilação tentou ler participação como coluna do evento; o
loader foi corrigido para consultar a relação existente `game_event_participants`,
sem migração. O sumário versionado preserva os resultados
que não dependem da permanência desses logs locais. O teste de promessa foi
reforçado com `$&`, `$$` e `$'`: falhou por interpolação de replacement strings
JavaScript, antes da correção por callback literal. A regressão de conteúdo e
publicação 5.6.2 passou em 40 testes após essa correção
(`/tmp/khaos563b-literal-{red,green}.log`). A suíte completa foi repetida com o
ajuste final. Não há nova interpretação, escape ou paráfrase do texto da fonte.

As regressões reexecutadas cobrem PROPOSE, ARCANA, QUERY, OBSERVE,
PREPARED_CHECK, CLARIFY, publicação 5.6.2, progressão e canonicidade das aventuras.
A mesma suíte inclui cenários Blue Rose existentes; suas regras não mudaram.

A última execução completa teve **484 acertos e uma falha** no teste antigo
`TEST-55-017/018/019/020`: os mesmos dois registros HEARD vieram em ordem
invertida, sem ORDER BY. As duas leituras do teste passaram a ordenar por
`eventId`, mantendo a comparação de todos os campos, timestamps e quantidade.
Não houve mudança de produção para esse ajuste. A suíte 5.5 foi reexecutada:
**10/10**, 13,76 s (`/tmp/khaos563b-phase55-final.log`). Os 485 casos estão
validados pela execução completa e pela reexecução afetada; não se declara uma
única execução completa final de 485/485 após essa correção de teste.

| TEST-ID        | Evidência executável                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------- |
| TEST-VOICE-001 | Unidade de perfis e integração com dois interlocutores no mesmo assunto                           |
| TEST-VOICE-002 | 12 sequências do laboratório; voz vinculada por ator, sem rotação de perfil                       |
| TEST-VOICE-003 | Perguntas diretas do cenário 02 e teste dirigido recebem ANSWER de desacordo                      |
| TEST-VOICE-004 | Assunto inexistente → CLARIFY; UNKNOWN não inventa explicação                                     |
| TEST-VOICE-005 | RESUME/ANSWER/DISAGREE/REFUSE exigem memória própria e não reconciliam                            |
| TEST-VOICE-006 | Promessa HEARD citada; mundo/relação/saúde/inventário preservados                                 |
| TEST-VOICE-007 | Fonte alheia e Tessa sem memória própria indisponíveis                                            |
| TEST-VOICE-008 | Estado, presença, acesso, participação, visibilidade, modalidade, tipo, digest e versão inválidos |
| TEST-VOICE-009 | Estado muda entre geração e transação; réplica revogada                                           |
| TEST-VOICE-010 | Métricas em 58 turnos/12 sequências, inputs congelados e revisão editorial                        |
| TEST-VOICE-011 | Galeria original rejeitada após teste fracassado nos laboratórios A/B e regressões                |
| TEST-VOICE-012 | Resultados oficiais literais de fracasso/sucesso; nenhuma consequência adicional                  |
| TEST-VOICE-013 | Controles adversariais e fontes sem ações, pensamentos ou sentimentos de Naelis                   |
| TEST-VOICE-014 | Fallback transacional; fragmento rejeitado ausente de chat/evento/proveniência                    |
| TEST-VOICE-015 | HTTP/histórico legível, repetição idempotente, reprodução integral dos 58 turnos A                |

Comandos principais, a partir da raiz (PATH com `.tools/node_modules/.bin`):

```sh
pnpm --filter @solo-rpg/shared-contracts test
node scripts/uv.mjs run pytest --cov=app --cov-report=term-missing
node scripts/test-integration.mjs --coverage
pnpm --filter @solo-rpg/api typecheck
pnpm --filter @solo-rpg/api lint
pnpm --filter @solo-rpg/api build
node scripts/uv.mjs run ruff check .
node scripts/uv.mjs run ruff format --check .
node scripts/uv.mjs run mypy app
```

O runner cria container/volume únicos `solorpg-test-*`, migrations e banco
`solorpg_test`, e os remove ao terminar. O laboratório recusa execução sem esse
identificador. Bridge local atravessa HTTP/grafo/prompt/schema/adaptador/roteador
de produção com provedor substituído por respostas roteirizadas. Testes do SDK
usam transporte HTTP em memória, não uma requisição Gemini. Nenhum banco de
campanha real é necessário.

## G. Comparação com a 5.6.3A

Mesmo arquivo de seis cenários, mesmas mensagens, mesma ordem, FIRST/VARIED,
58 turnos. O laboratório A foi reexecutado sem vínculos; comparação exige
igualdade do texto publicado e inputs, ignorando apenas IDs aleatórios de banco.
Os artefatos originais e o analisador A permanecem intactos.

A preparação B acrescenta vínculos revisados e estado público explícito
`UNRESOLVED` para fontes que já registravam o desacordo não resolvido. Não foi
deduzido da prosa pelo produto. O seletor B foi roteirizado por cenário/turno
para pedir assunto/ato e escolher uma réplica preparada. FIRST pega a primeira;
VARIED alterna variantes disponíveis. A regra de fala contextual única impede
o acréscimo da citação bruta como segunda fala. Cena e perguntas finais seguem
a mesma escolha do laboratório A. **Essa comparação inclui preparação e seleção
roteirizada; não isola efeito de prompt nem mede uma decisão do Gemini.**

| Medida sobre texto publicado (29 turnos por seletor) | A FIRST | B FIRST | A VARIED | B VARIED |
| ---------------------------------------------------- | ------: | ------: | -------: | -------: |
| Respostas consecutivas idênticas                     |      10 |       1 |        1 |        1 |
| Respostas completas distintas (soma por sequência)   |      13 |      24 |       27 |       24 |
| Ocorrências de parágrafo                             |      73 |      73 |       81 |       73 |
| Ocorrências repetidas de parágrafo                   |      50 |      39 |       37 |       35 |
| Fallbacks publicados                                 |       1 |       1 |        1 |        1 |
| Perguntas genéricas finais                           |      22 |      22 |       22 |       22 |

FIRST reduz repetições completas adjacentes de 10 para 1. VARIED permanece em 1,
e suas respostas completas distintas caem de 27 para 24: eliminar a concatenação
de memória não é sinônimo de maior diversidade textual. Parágrafos repetidos
passam de 50/73 para 39/73 em FIRST e de 37/81 para 35/73 em VARIED. A descrição
da sala e as perguntas finais continuam dominantes. Não há vitória literária
universal nem comparação causal de modelos.

Na revisão do agente, cenário 02 passa de pertinência 2 para 3 e continuidade
3 para 4; cenário 05 apresenta o mesmo ganho. Personalidade vai de 2 para 3 nos
cenários com fala; o cenário 03 segue sem nota de personalidade. Naturalidade
continua 2 em 01/04/06 e fica em 3 em 02/05. Prosa permanece funcional (2 nos
cenários com diálogo); ritmo fica em 2. Os dez critérios, notas anteriores,
racional por critério e todos os textos VARIED constam da revisão. O ganho de
continuidade não recupera detalhes específicos sobre a decisão de continuar a
viagem; retoma apenas o desacordo não resolvido autorizado.

Métricas e corpus completos:
[comparação](../ai/phase-5.6.3b-comparison.json),
[58 turnos publicados](../ai/phase-5.6.3b-lab-result.json),
[revisão editorial do agente](../ai/phase-5.6.3b-editorial-review.json).
A revisão usa os dez critérios e eliminadores da
[rubrica A inalterada](../ai/phase-5.6.3a-rubric.json), sem média automática que
compense uma violação canônica. A ausência de violação nos controles não é
garantia semântica universal.

Para reproduzir a comparação após o runner:

```sh
node scripts/uv.mjs run python -m app.evaluation.contextual_dialogue \
  --before ../../docs/ai/phase-5.6.3a-lab-result.json \
  --replay /tmp/khaos563a-lab.json \
  --after /tmp/khaos563b-lab.json \
  --output /tmp/khaos563b-comparison-new.json
```

O comparador recusa sobrescrever evidência ou aceitar histórico/inputs
divergentes. Os IDs `563A-01..06` são mantidos como identificadores dos cenários;
turnos da execução B usam prefixo `563B`.

## H. Exemplos completos publicados

### Resposta à lembrança do desacordo

Naelis: “O que você lembra do desacordo que tivemos?”

Antes — `563A-02-VARIED-t3`:

> Iria — Não tenho uma resposta segura para isso. Pode me contar mais?
>
> Iria — Ouvi este relato; isso não comprova que seja verdade:
>
> > Iria respondeu (fala atribuída, não verdade do mundo): Iria — Ainda preciso de razões para acreditar. O que sustenta essa suspeita?
> > Iria — Ouvi este relato; isso não comprova que seja verdade:
> >
> > > Iria respondeu (fala atribuída, não verdade do mundo): Iria — Prefiro cautela. O que despertou sua suspeita?
> > > Iria — Recordo o que presenciei:
> > >
> > > > MEMORIA_ANTERIOR: Iria e Naelis discordaram sobre a decisão de continuar a viagem; o desacordo não foi resolvido.
>
> A luz dourada repousa nas lombadas gastas; a madeira conserva o brilho do verniz.
>
> O que você deseja fazer?

Depois — `563B-02-VARIED-t3`:

> Iria — Não considero aquele desacordo resolvido. Prefiro esclarecer o que ficou entre nós antes de chamar isso de acordo.
>
> A luz dourada repousa nas lombadas gastas; a madeira conserva o brilho do verniz.
>
> O que você deseja fazer?

### Continuidade após mudar de sessão

Naelis: “Iria, o que você lembra da nossa discussão anterior?”

Antes — `563A-05-VARIED-t4`:

> Iria — Prefiro cautela. O que despertou sua suspeita?
>
> Iria — Ouvi este relato; isso não comprova que seja verdade:
>
> > Iria respondeu (fala atribuída, não verdade do mundo): Iria — Ainda preciso de razões para acreditar. O que sustenta essa suspeita?
> > Iria — Ouvi este relato; isso não comprova que seja verdade:
> >
> > > Iria respondeu (fala atribuída, não verdade do mundo): Iria — Prefiro cautela. O que despertou sua suspeita?
> > > Iria — Recordo o que presenciei:
> > >
> > > > MEMORIA_ANTERIOR: Iria e Naelis discordaram sobre a decisão de continuar a viagem; o desacordo não foi resolvido.
>
> A luz dourada repousa nas lombadas gastas; a madeira conserva o brilho do verniz.
>
> Como deseja prosseguir?

Depois — `563B-05-VARIED-t4`:

> Iria — Meu ponto é este: a discussão aconteceu, e não vou tratá-la como encerrada apenas porque voltamos a conversar.
>
> A luz dourada repousa nas lombadas gastas; a madeira conserva o brilho do verniz.
>
> Como deseja prosseguir?

O segundo caso usa a memória própria previamente autorizada, mantendo o desacordo. A ausência da cadeia de citações nesta seleção decorre de escolher uma fala preparada completa; o catálogo legado e a recuperação de memória não foram filtrados. Não se implementou G5.

### Duas vozes, mesmo assunto — TEST-VOICE-001

Pergunta sintética sobre o desacordo: cada NPC tem fonte WITNESSED própria,
com sua participação registrada em um evento distinto.

Iria reservada:

> Iria — Não considero aquele desacordo resolvido. Prefiro esclarecer o que ficou entre nós antes de chamar isso de acordo.
>
> A luz dourada repousa nas lombadas gastas; a madeira conserva o brilho do verniz.
>
> O que você deseja fazer?

Tessa acolhedora:

> Tessa — Quero falar disso com clareza. Ainda temos um desacordo, e ouvir você não significa que já esteja tudo resolvido.
>
> A luz dourada repousa nas lombadas gastas; a madeira conserva o brilho do verniz.
>
> O que você deseja fazer?

Ambas preservam o conflito; Tessa oferece espaço para ouvir, Iria prefere esclarecer um ponto. A distinção é visível neste recorte, sem validar voz humana ou personalidade complexa.

### Limite de assunto e conhecimento alheio

`TEST-VOICE-004/007/008`. O texto abaixo foi publicado tanto para assunto inexistente quanto para Tessa sem memória própria de desacordo. Não houve evento ou mudança no mundo.

> Não há uma resposta autorizada para esse assunto e interlocutor. Pode esclarecer o que deseja conversar?

### Promessa continua sendo fala

`TEST-VOICE-006`. A descrição vinculada é uma fala registrada. A publicação não alterou mundo, relação, saúde ou inventário; a réplica foi lembrada como HEARD.

> Iria — Da promessa, posso retomar o que ouvi; não um resultado confirmado:
>
> > Iria disse: pretendo ajudar quando puder.
>
> A luz dourada repousa nas lombadas gastas; a madeira conserva o brilho do verniz.
>
> O que você deseja fazer?

### Estado revogado, fallback seguro

`TEST-VOICE-009/014`. Após o estado mudar, a réplica preparada foi rejeitada. O fallback legado abaixo foi publicado e lembrado; é seguro, mas devolve uma pergunta genérica sobre suspeita e perde pertinência.

> Iria — Prefiro cautela. O que despertou sua suspeita?

### Limite literário que permanece

`563B-01-VARIED-t2` — “Quero ouvir sua opinião sobre o nosso desacordo.” Neste cenário não há fonte de desacordo preparada:

> Iria — Não tenho uma resposta segura para isso. Prefiro pedir que esclareça a inventar uma explicação.
>
> A luz dourada repousa nas lombadas gastas; a madeira conserva o brilho do verniz.
>
> Como deseja prosseguir?

Há segurança e voz acolhedora, mas não uma opinião específica. No cenário 02, a recusa final menciona condicionalmente um pedido de perdão apesar de Naelis ter negado perdoar. A fala não confirma reconciliação, porém o encaixe editorial continua imperfeito.

## I. Limitações e riscos

- O repertório trata quatro assuntos; não responde perguntas arbitrárias de
  opinião, história, motivo ou plano. Nos cenários 01/04/06 ainda há respostas
  seguras que apenas pedem esclarecimento. Isso limita pertinência.
- Vozes são distinguíveis no recorte preparado, mas compartilham vocabulário
  explicativo e preocupação em diferenciar fala de efeito. A prosa ainda parece
  cautelosa e instrutiva; não constitui experiência de romance validada.
- Permanecem descrições repetidas, perguntas finais recorrentes e citações
  aninhadas no catálogo legado. Não se implementou deduplicação entre turnos,
  novo filtro/resumo de memória, planejamento ou variação livre.
- O modelo real pode ignorar a réplica preparada e escolher um texto genérico
  autorizado; segurança não garante relevância ou boa seleção.
- A autoria da associação assunto/fonte exige revisão local. Digest não detecta
  uma preparação semanticamente errada. Estado é comparação literal, não uma
  interpretação psicológica; mudar estado exige nova preparação explícita.
- Memória vinculada que sair da janela já existente não é oferecida: falha
  fechada pode reduzir disponibilidade. Não se alterou recuperação de memória.
- O loader v1 atende personagens regulares; Story Cards não foram habilitados
  automaticamente. Não há editor de conteúdo/preparação nem validação humana
  das vozes. Expansões devem ser versionadas e avaliadas separadamente.

A comparação SHA-256 com a fotografia inicial verificou 387 arquivos
preexistentes: **372 permanecem byte a byte iguais**; 15 alterações
são os pontos de produção/contrato e o registro de testes descritos em C.
`.env`, `.env.example`, modelos/provedores/roteador, regras Blue Rose, fontes de
aventuras/digests, PDFs presentes no inventário, Director, progressão, recibos
5.6/5.6.1/5.6.1.2/5.6.2, fixtures e artefatos A estão preservados. Alterações
anteriores, inclusive as já não commitadas, não foram revertidas. Os arquivos B
são novos; o artefato A não foi sobrescrito. Ver
[sumário de validação](../ai/phase-5.6.3b-validation-summary.json).

## J. Proposta para a próxima intervenção

Submeter esta evidência à avaliação do operador. A melhoria demonstrada é de
repertório autorizado e ligação explícita entre assunto, voz, estado e memória;
persistem gargalos de ritmo/composição. Uma futura intervenção pode tratar G3
em escopo próprio, mantendo autorização integral e sem avançar objetivos pelo
número de turnos. G4/G5/G6 precisam de propostas separadas. Nenhuma dessas
intervenções foi iniciada nesta entrega.

## K. Plano de avaliação real futura

Não executado. Após revisão humana do conteúdo e do plano, solicitar nova
autorização específica de provedor/modelo, projeto gratuito/billing, quantidade
de requisições, limite de saída, estágios, retries/fallback e critérios de parada.
As permissões antigas de dois probes PROPOSE não autorizam este experimento.

Proposta de amostra: as mesmas 12 sequências/58 mensagens, com preparação B
congelada e seus hashes. Medir separadamente seleção de assunto/ato em PROPOSE,
seleção integral em NARRATE, aceite estrutural, autorização determinística e
qualidade editorial humana. Os traces atuais têm 58 PROPOSE e 46 NARRATE com geração potencial: 104 chamadas
na trajetória roteirizada. Os demais estágios NARRATE são determinísticos no
grafo e não chamam provedor. O teto teórico de uma seleção diferente é 116
chamadas (58 PROPOSE e até 58 NARRATE). O limite da rodada, tokens por estágio e
critérios de parada precisam ser aprovados antes; estimativa não é autorização.
Não reutilizar tentativas não consumidas.

Usar apenas campanhas sintéticas e PostgreSQL descartável; preservar JSONs
originais, tokens/modelo/latência, catálogo enviado e texto efetivamente
publicado. Rejeição ou fallback seguro não convertem erro semântico em acerto.
Parar diante de autenticação, cobrança, 429, modelo inesperado, sigilo ou risco
de efeitos reais. Avaliar pertinência, distinção de voz, continuidade e as mesmas
dez dimensões, com eliminadores canônicos. Não enviar gabaritos ao modelo.
Mesmo aprovação integral valida apenas essa amostra e não autoriza autonomia
completa, campanha inteira ou início automático de outra fase.
