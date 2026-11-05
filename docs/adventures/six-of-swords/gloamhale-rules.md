# Regras locais da mansão e do ritual

Incremento de 31/10/2026. Fontes: Six of Swords pp.15,17,24–26; livro básico brasileiro pp.311–312 (testes avançados), 315–316 (perigos). As operações abaixo usam a CLI privada `adventure:command`, com `campaignId`, `sessionId`, `commandId` e `reason`. Reutilizar o mesmo UUID e conteúdo recupera o recibo; mudar o conteúdo com a mesma chave é recusado. Não existe acesso por HTTP ou proposta do LLM.

## Transformação infantil

`GLOAMHALE_ENTER` exige a cena `reborn` ativa e toda a equipe presente, de quatro a seis integrantes. Recebe `children:[{characterId,age,fear}]` e `playerApprovedMemories:true`. Idades devem estar entre 7 e 15; a memória de medo deve ser fornecida e aprovada pela jogadora. A operação não inventa infância para Naelis. O armazenamento conserva os atributos adultos, idade, medo privado e posição individual. A entrada transforma a aparência, mas não altera imediatamente os atributos.

O dado de intervalo é 1d3, obtido por `ceil(d6/2)`, registrado em auditoria privada. `GLOAMHALE_TIME` recebe `minutes` inteiros de 1 a 1440 e avança **tempo narrativo confirmado**. Não usa o relógio real da sessão ou quantidade de mensagens. Cada intervalo atingido aplica uma mudança cumulativa; até quatro podem ocorrer numa operação:

| Estágio         | Comunicação | Destreza | Demais habilidades |
| --------------- | ----------- | -------- | ------------------ |
| 0               | original    | original | original           |
| 1               | original    | original | −1                 |
| 2               | +1          | original | −2                 |
| 3               | +2          | −1       | −3                 |
| 4 e posteriores | +3          | −2       | −4                 |

Os valores adultos não são recalculados nem truncados em zero. Saúde máxima, nível, focos e talentos não mudam por inferência. Os testes existentes leem os atributos temporários persistidos. `ABILITY_SET` fica bloqueado para personagens transformadas, evitando perder uma correção ao restaurar o original.

`GLOAMHALE_MOVE` recebe `characterId` e `location` (`MANOR`, `GROUNDS` ou `GROTTO`) e registra uma chegada confirmada. Preparar outra cena por si só não muda posições individuais: conferir também presenças e deslocamentos, especialmente após alguém aparecer na gruta.

`GLOAMHALE_RETURN` recebe `characterIds` e uma causa confirmada: `LEFT_LAKEBED`, `MANOR_DESTROYED` ou `MUD_MOTHER`. Restaura exatamente os atributos adultos e remove a transformação desses integrantes. Sair apenas pela porta da mansão não é uma causa válida. A consequência específica de incêndio, inundação ou ajuda da Mud Mother continua exigindo adjudicação; este comando não declara todos os espíritos libertos. Uma nova entrada só é aceita depois que toda a equipe recuperar a forma adulta. Grupos com entradas em momentos diferentes permanecem fora do recorte automático.

`GLOAMHALE_DAMAGE` recebe `characterId` e `damage`, o **dano final já adjudicado**. Exige personagem presente, viva e dentro da mansão. Se chegar a zero de Saúde, a personagem desperta na gruta com 1, ainda criança; a gruta torna-se local conhecido. Não ocorre morte comum, cura por Curar ou limpeza de fadiga. Reduzir Saúde a zero com `RESOURCE_SET` dentro da mansão é recusado; usar o comando específico. Combate comum continua bloqueado nessa aventura.

A interação entre exaustão mortal e a regra da casa não está automatizada. Curar com fadiga 3 ou mais dentro da mansão é bloqueado antes dos dados e exige adjudicação local. No incremento 5.2, REST avança o tempo ficcional e alimenta o relógio da casa na mesma transação. Não registrar novamente esse intervalo com GLOAMHALE_TIME. Viagens sem duração preparada continuam exigindo registro validado.

## Ritual coletivo

Preparar a cena `ritual`. `GLOAMHALE_RITUAL_BEGIN` exige toda a equipe infantil dentro da mansão e recebe:

- `eggEaters`: IDs de quem comprovadamente comeu os ovos de seis meses;
- `dispelledHaints`: confirmação de que algum haint foi **libertado**, não apenas derrotado;
- `hazardProtection`: `NONE` ou `ARMOR`, decisão explícita do operador sobre proteção contra o perigo psíquico, acompanhada de justificativa em `reason`. O capítulo de perigos deixa essa avaliação ao Narrador; não se afirma que o suplemento especifica automaticamente a proteção. Escudo Psíquico e outras proteções precisam de adjudicação própria.

O limiar fica fixado em `12 + integrantes`: 16 para a equipe fornecida. O sistema guarda progresso, tarefas tentadas, usos individuais dos benefícios, rolagem pendente e estado ACTIVE/STOPPED/COMPLETED.

`GLOAMHALE_RITUAL_ROLL` recebe `characterId`, `task`, `benefit` e `modifier`. As tarefas são `CANDLES` = Constituição (Vigor), `POEM` = Vontade (Autodisciplina), `SHAPING` = Inteligência (Moldar). Usa habilidade atual, um foco pertinente conhecido (+2 ou +3), penalidade de fadiga e o modificador local explícito. Talentos, condições, Bonds e recursos precisam ser conferidos **antes** de rolar; o campo não concede recursos nem constitui automação dessas regras.

O NA é 11. Benefício `EGG` ou `HAINT_TARGET` permite sucesso com 10; `HAINT_DAMAGE` reduz o dano que a personagem receberia à metade. `NONE` não consome benefício. Cada personagem usa o ovo uma vez e ajuda dos haints uma vez, compartilhando a escolha entre reduzir dano ou NA. Usos são reservados junto à rolagem, antes de conhecer seu resultado, sem rerrolagem por nova chave.

A rolagem é persistida e mostra os PF gerados, sem aplicar progresso ou dano ainda. `GLOAMHALE_RITUAL_RESOLVE` exige `declineStunts:true`: uma decisão explícita de dispensar façanhas naquele teste. Não há gasto automático nem descarte silencioso de PF. A aplicação de façanhas nesse ritual permanece pendente; a resolução automática descreve somente o caminho em que a jogadora a dispensa. Não iniciar esse caminho esperando suporte automático a gastos de PF. Não há atualmente um comando de gasto de façanhas do ritual.

Na resolução, sucesso soma o Dado de Drama ao total coletivo; falha não soma. Cada tarefa deve ter sido tentada ao menos uma vez. Rola 2d6 de perigo em toda tentativa, inclusive a última. Sucesso reduz à metade, arredondando para baixo. Quando proteção por armadura foi escolhida localmente, subtrai o valor fixo do perfil; em seguida, ajuda dos haints reduz pela metade o dano restante, arredondando para baixo. Essa ordem de proteção/ajuda deve ser aceita como adjudicação local, pois não é detalhada pelo suplemento. A exceção da gruta também vale para esse dano. A operação devolve `eventIds` públicos, utilizáveis como evidências na revisão da sessão. Rolagem, consumo dos benefícios, Saúde, gruta, progresso, eventos e recibo ficam protegidos por transações; repetir uma operação não repete dano ou pontos.

Enquanto existe rolagem pendente, não é permitido rolar novamente, descansar, corrigir a ficha, trocar a cena ou finalizar a sessão. Resolver o teste libera a continuidade; depois é possível interromper o ritual antes de outra tentativa.

`GLOAMHALE_RITUAL_STOP` interrompe voluntariamente entre tentativas. Cessa dano futuro e bloqueia reinício definitivamente. Uma tentativa que já teve os dados rolados deve resolver o perigo acionado antes da interrupção: não é permitido descartar seus dados, dano ou consumo de benefícios depois de conhecer o resultado. O banimento definitivo não ocorre; Jaymes pode recuperar forças conforme a fonte.

Concluir o ritual registra o banimento de Jaymes, mas não restaura automaticamente a forma adulta nem aplica orbes, Corrupção ou a libertação de Erila/haints. Esses destinos possuem condições próprias. Eventos confirmados podem servir como evidência para revisão humana de objetivos e entram no resumo da sessão. Medos, intervalos futuros e motivos do operador permanecem no contexto privado do Mestre.

## Persistência e implantação

A migration 0006 acrescenta `adventure_instances.mechanics` como JSONB nulo para instâncias anteriores; não transforma personagens ou inicia ritual ao migrar. Aplicar 0005 e 0006 antes da API atual. Definição original e estado mecânico jogado permanecem separados. O rollback deve preservar as tabelas e restaurar as formas adultas por procedimento auditado antes de voltar a uma versão que desconheça a transformação; não apagar snapshots ou campanhas.

Ver [operação geral](adaptation-plan.md) e [evidências de validação](../../testing/six-of-swords-validation.md).
