# Auditoria do mundo narrativo de Gloamhale

**Resultado: PARCIALMENTE.** Há base para cenas preparadas, descrições curtas, um elenco por cena e operações específicas, como o relógio da mansão e o ritual. O percurso livre exige relações espaciais e condições que hoje são texto, decisões do operador ou dados ausentes. A fronteira de publicação restringe o que pode aparecer no chat, mas não completa o material que falta ao contexto.

Relatório de Mestre. Contém soluções e revelações da aventura. Fonte primária: [PDF local de Six of Swords](../../references/blue%20rose%20-%20six%20of%20sword.pdf), primeira aventura, páginas impressas 6–29, com mapa p. 16 e handouts pp. 132–133. As chaves abaixo são do KHAOS quando entre crases. Subáreas sem chave mantêm o nome descritivo, sem criar um local novo no jogo. Os detalhes canônicos foram resumidos para auditoria.

## Armazenamento e recuperação

| Camada | Implementação e efeito |
| --- | --- |
| Referência versionada | [AdventureRegistry](../../../apps/api/src/adventures/registry.ts) e [composição](../../../apps/api/src/adventures/adventure-registry.module.ts) registram as três versões de `six-of-swords-gloamhale`, com namespace `gloamhale`. [v1](../../../apps/api/src/adventures/gloamhale.ts) contém 21 locais. [v2](../../../apps/api/src/adventures/gloamhale-v2.ts) acrescenta transições explícitas na estrada/vila e opções limitadas. [v3](../../../apps/api/src/adventures/gloamhale-v3.ts) acrescenta três sessões e progresso por evidência, sem ampliar o cadastro espacial. |
| Banco de referência e instância | [importAdventure](../../../apps/api/src/adventures/import.ts) grava JSONB em `adventure_definitions` por `id:vN` e digest. `adventure_instances` fixa a referência, namespace, relógio e mecânicas da campanha. Importação idempotente e em rascunho. `adventure_cast` guarda chave, conhecimento público da identidade e estado. `adventure_scenes` guarda a cena selecionada por campanha/sessão. [Schema](../../../apps/api/src/database/adventure-schema.ts). |
| Mundo material | Cada local é materializado como `world_entities`, tipo LOCATION, com UUID derivado, descrição, status, acessibilidade, visibilidade e notas privadas. Começa `GM_ONLY`, inacessível. O registro de instância não guarda pai, aresta, itens do recinto ou pistas como entidades vinculadas. `game_items` e inventário formam outro catálogo. [Schemas](../../../apps/api/src/database/game-schema.ts) e [validação da definição](../../../apps/api/src/adventures/definition.ts). |
| Grafo e preparação | A definição tem `connections: key[]`, `character.locationKey` e `scene/encounter.locationKey`. `objects`, `discoverable` e `secrets` são listas de texto. Não há aresta com condição ou tipo, nem hierarquia espacial. [Preparação de cena](../../../apps/api/src/adventures/execution.ts) monta plano, abertura e opções. [activateAdventureScene](../../../apps/api/src/adventures/state.ts:238) torna o local público e acessível e marca o elenco da cena como conhecido. `nextSceneKey` é transição de opção bem-sucedida, não travessia genérica de `connections`. |
| Director e mudanças | [directorState](../../../apps/api/src/adventures/director.ts) calcula progresso, evidências e elegibilidade a encerramento. [gloamhale-runtime.ts](../../../apps/api/src/adventures/gloamhale-runtime.ts) mantém estado especial de crianças, relógio, ritual e exceção da gruta. Mudanças locais auditadas podem atualizar `world_entities`; a definição original permanece a referência. O Director não gerencia portas, presença por recinto, objetos ou variantes de descrição por visita. |
| Contexto NestJS | [adventureContext](../../../apps/api/src/adventures/state.ts:285) resolve a cena vigente e lê o local da definição, encontro, segredos, estado especial e elenco conhecido da cena. [NarrativeContextService.build](../../../apps/api/src/narrative/context.service.ts:160) lê até 20 entidades PUBLIC/PLAYER_ONLY da campanha, sem recorte espacial e sem ordenação nessa consulta. Inclui nome, descrição, status e acessibilidade. Atores regulares vêm do snapshot da campanha e da condição de vida, e indivíduos da aventura vêm do elenco conhecido da cena. Não há filtro adicional por localização corrente de cada ator. |
| Projeção para o modelo | No FREE com `selection`, [planner_request](../../../apps/ai-service/app/narrative/selection.py) retém nomes e disponibilidade, fontes, opções com teste, menções e discurso público recente. `world` vira nome/acessibilidade. As descrições disponíveis entram por [selectionContext](../../../apps/api/src/narrative/information.ts), em PUBLIC, junto à abertura. Eventos conhecidos próprios da protagonista viram KNOWN. Estado textual de `world.status`, topologia, listas de objetos e `adventure.gm` ficam fora desta projeção. O ramo SCENE/legado do [grafo](../../../apps/ai-service/app/narrative/graph.py) recebe o contexto amplo e pode ver GM e identidade privada. A fronteira do prompt depende do ramo. |
| Conhecimento e publicação | `adventure_memories` associa personagem e evento por campanha. O recorte do cast é individual e o caminho de diálogo opt-in valida fontes e identidade por cena. O [índice editorial](../../narrative/story-card-editorial-index.v1.json) e os TXT não são loaders de produção. No [rendering](../../../apps/api/src/narrative/context.service.ts:623), fontes, cena e falante são projetados sem enviar o bloco GM. [publicationChoices e validateRendering](../../../apps/api/src/narrative/rendering.ts) recompõem catálogo e exigem coincidência integral de texto, tipo, falante e referências. Visibilidade pública, presença e segredo editorial são responsabilidades distintas. |

Achados transversais. A ativação eleva `accessible` a verdadeiro, mesmo se o estado persistido anterior representava interdição. Ela não desfaz a acessibilidade de locais já visitados. Assim, descoberta e acesso atual acabam compartilhando um sinal. O recorte de até 20 entidades pode incluir lugares antigos em vez da área pertinente. Na seleção, uma descrição pública é tratada como fonte mesmo se diz algo que o livro reserva a uma investigação. O validador de publicação protege contra material fora do catálogo, mas uma informação prematuramente autorizada na origem exige correção nessa origem.

## Inventário canônico e cobertura

**D** indica registro por chave na definição. **C** indica que uma cena pode fornecer abertura, local e elenco, normalmente após preparo local. **T** indica que o detalhe está apenas em texto de local, cena ou encontro. **Ø** indica ausência de registro próprio. Mesmo quando há D e C, a coluna de cobertura indica o que falta para uso livre. No inventário, o perceptível está separado das descobertas e condições de Mestre.

| Lugar e páginas | Relações, acessos e perceptível | Pessoas, objetos, descobertas e mudanças | Cobertura e lacuna |
| --- | --- | --- | --- |
| Lago/leito de Husqan, rio desviado e região p. 6 | O povoado e as lavouras ocupam o leito drenado. O pântano e o solar ficam no mesmo recorte regional. | Drenagem histórica e colonização explicam o cenário. O passado da casa e a lenda do tesouro têm fontes distintas. | T em sinopse/local. Ø para lago e rio como entidades operáveis. |
| Estrada para Lakesheart `road`, pp. 7–8 | Estrada seca, carroça e fios da armadilha. A via acompanha o pântano antes de virar para Lakesheart. | Griseld, Amos e moradores na emboscada; escolta condicional. Segundo encontro com Fen e xamã, retirada por perdas. Intenção dos aldeões pode ser avaliada por Empatia. | D/C. Carroça e fios são texto. V2 tem ida explícita à vila; encontro Fen e sua retirada exigem controle local. |
| Lakesheart `lakesheart`, pp. 8–11, 13–14 | Rua principal, prédios novos, casas, campos, taverna e forja. Ao chegar, o arado está em reparo diante da taverna. | Percepção graduada 7–17 distingue tensão, corvos, forma do arado, proteção e choro. Audição posterior pode apontar estrada/pântano. Informações de moradores incluem desaparecimentos, amuletos e rumores divergentes. | D/C. A descrição pública é curta; arado, tabela de descobertas e relações com subáreas não são capacidades espaciais. |
| Taverna, local de pernoite e arredores, pp. 8–10 | A taverna segue aberta ao anoitecer; o grupo pode dormir lá, acampar ou patrulhar. | Amos oferece hospedagem se os quatro moradores retornarem em segurança. Chant pode surgir onde o grupo escolheu passar a noite; sinos denunciam sua presença. | T/Ø. `chant-talk` está vinculada à vila, não ao lugar escolhido para pernoite. |
| Casa de Chant, janela, quarto e alpendre, pp. 10–11 | Casa rural próxima. Janela permite o retorno discreto depois da conversa. | Enit e irmão são relações do card. No desaparecimento opcional, Enit está no alpendre e Chant ausente; rastros do quarto levam à estrada. Baú de recompensa condicionado à cena. | T/Ø. `losing-chant` fica na vila e lista Chant no elenco mesmo durante o desaparecimento. |
| Lavouras, margem do pântano e ninho, pp. 9–11, 14 | Campos circundam a rua. A margem oferece cobertura aos dardeiros. Ninho de pardais é desvio na busca pelo choro; ninho de strix é outro ponto, no pântano. | `Dawning Dark` opcional: observar e seguir xamã ou examinar amuleto de couro e pedras; teste diferencia bênção. Ninho de strix surge após falha na busca pelo canto. | T/C nas cenas correspondentes. Ø para os alvos e subáreas individuais. |
| Salão de reuniões, loja de Griseld e rua após conflito, pp. 13–14 | O salão confronta a rua; a loja acolhe parte dos sobreviventes. | `Murder` depende de mortes após pedido de paz dos Fen; corpos com amuletos e mensagem no salão. `Preparing for Harvest` depende de retorno após Mud Mother, com Enit reconhecível se Chant desapareceu. Persuasão pode impedir ou adiar a marcha. | T/C na vila, sem entidades próprias nem atualização automática da rua e moradores por esses gatilhos. |
| Pântano `swamp`, pp. 11–14 | Lama, vinhas, árvores, amuletos com direção. Liga estrada/vila, acampamento e caminho à propriedade. | Percepção 15/17 distingue movimento e armas guardadas. Guerreiro oferece escolta pacífica. Canto noturno conduz à mansão com Audição 14; ovos adequados ajudam. Falha pode levar aos strix. | D/C. Trilhas, amuletos e trilha do canto ficam em prosa. O enxame é arquétipo, não indivíduo já presente. |
| Acampamento Fen `fen-camp` e cabana da Mud Mother, pp. 12–13 | Redes, tendas e cabana única em plataforma. Jasmim e carne defumada. A unção é condição para entrar na cabana e receber alimento. | Mud Mother, escolta, banquete, ovos em conserva e troca por objeto de valor pessoal. Declarações sobre desaparecimentos e amuletos surgem da conversa, canto após experimentar. No acampamento abandonado, fogueira, objetos pisados e rastros 14. | D/C para acampamento, T/Ø para cabana e limiar. Cenas cheia/vazia distintas, sem estado espacial ou acesso individual derivado dos eventos. |
| Antiga estrada e terrenos `grounds`, pp. 14–15, 24 | Sulcos de rodas descem ao terreno estéril; caminho contorna fonte seca até porta frontal. Gruta fica atrás. | Fonte, estátuas quebradas, cadeira de rodas e bolinhas. Teste 11/13 pode ouvir e localizar choro; falha traz visão individual ligada ao medo. | D/C. Estrada antiga, fonte e objetos não são alvos próprios. A ligação para a gruta é chave sem condição. |
| Vestíbulo `manor`, pp. 15–17 | Porta frontal abre facilmente. Parquete empenado, lustre caído, escada com degraus centrais faltando e cinco portas. | Porta fecha após entrada de todos e transformação; relógio altera atributos até quatro vezes. O livro prevê diferenças ao revisitar aposentos. | D/C, relógio especial implementado. Porta e escada são texto, e a abertura não oferece a descrição integral nem trânsito livre pelos cinco destinos. |
| Parlor `parlor`, mapa 1, p. 17 | Foyer é a única saída. Couro manchado, troféus apodrecidos, escrivaninha e busto. | Segunda linha do poema na parede. Compulsão e alvo dependem do grupo, com resistência NA 13. | D/C; verso e risco em texto/encounter. Sem objetos ou verso recuperáveis por vínculo. |
| Drawing Room `drawing-room`, mapa 2, pp. 17–18 | Portas ao foyer e estufa; cortinas rotas, tapeçaria degradada e piano. | Olfato 11/13/15, cartilha de Heath com poema incompleto. Teclas mostram ilusão temporária; tampa solta espectro que pode seguir o grupo. | D/C; piano e cartilha T. Nenhum alvo independente ou estado teclas/tampa. Espectro na lista da cena como arquétipo. |
| Conservatory `conservatory`, mapa 3, p. 18 | Drawing Room e alçapão para Cellar. Porta externa enterrada, portanto inacessível. Vidro quebrado, lama, bancadas e grades. | Terceiro verso. Fruta achada com Visão 9, encantamento por Segunda Visão, cera por olfato rhydan graduado ou contato. Tocar/mover causa marca vermelha temporária. | D/C. Fruta e armadilha T. Sem ligação estrutural para a porta soterrada nem registro de descoberta/contato. |
| Cellar `cellar`, mapa 4, pp. 18–19 | Alçapão à estufa e porta à adega. Corredores e celas, camas, baldes, ossos e brinquedos. | Ecos, haints e escuridão. Escudo/medo condicionam acesso e permanência. Medicina/Cura 7/9 identifica ossos. Presentes, ameaça e proximidade do espectro mudam comportamento. | D/C na cena conjunta `haints`. Celas, presentes e instâncias dos haints não materializados nessa relação espacial. |
| Wine Cellar `wine-cellar`, mapa 5, p. 19 | Porta ao Cellar e alçapão com escada à cozinha. Tonéis, gaiolas, sussurros e escuridão impenetrável. | Quinto verso, ossos examináveis, bolinha e haint. Quatro devoluções da bolinha ou Luz dissipam a escuridão; retenção pode provocar ataque. | D/T. A cena conjunta está em `cellar`, sem cena própria nem objeto/contador de interação. |
| Kitchen `kitchen`, mapa 6, pp. 19–20 | Foyer, Dining Room e alçapão da adega. Forno, potes, facas e louça partida. | Medo limita incursão; Visão 13/15 detecta movimento/intenção dos objetos; abrir armário pode disparar enxame. | D/C. Armários e utensílios T; os arquétipos da cena não representam gatilhos acionados. |
| Study `study`, mapa 7, p. 20 | Porta única ao foyer. Estantes, teto baixo, papéis e pastas aparentemente intactos. | Procurar 7/9/11/13/15/17 revela, em camadas, sanatório, tratados, livros de jejum/isolamento, cartas, fichas clínicas e diário (handout p. 132). | D/C. Níveis em texto de encontro e adjudicação local. Sem documento endereçável ou teste selecionável para essa busca na cena. |
| Dining Room `dining-room`, mapa 8, pp. 20–21 | Foyer e cozinha. Mesa de carvalho e banquete ilusório. | Autodisciplina 12, vislumbre a 15, sineta com Visão 10 após resistir. Mãos sob o piso quando observado. Dissipação e penalidade de Vontade para quem comeu; retorno mostra deterioração, sem novo banquete. | D/C. Sineta T. A descrição padrão identifica a ilusão e não muda por visita. Atualização pública manual é possível. |
| Upstairs Hallway `upstairs`, mapa 9, p. 21 | Escada desde foyer, quatro portas. Tapete, pinturas e luz; madeira deteriorada diante da porta barrada com insulto. | Cerca de dez minutos para remover os móveis que bloqueiam o quarto de Erila. Outras portas para quarto principal, brinquedos e escada do sótão. | D/T. Sem cena própria, barricada sem entidade, custo ou condição na aresta. |
| Mistress Bedroom `mistress-bedroom`, mapa 10, pp. 21–23 | Corredor por porta barricada. Cama, flores, cosméticos e espelho discrepante. | Espelho revela decadência e quarto verso. Elegibilidade da possessão, percepção, escolha/resistência e relato condicionado de Erila. Não conhece solução da própria libertação. | D/C. Texto de local identifica Erila e a função do espelho antes do exame. Cast conhecido pela cena, e sua ficha privada entra no contexto amplo. |
| Master Bedroom `master-bedroom`, mapa 11, p. 23 | Única saída ao corredor. Destroços suspensos, sem ilusão de conservação. | Primeiro verso. Ataque do poltergeist prioriza hospedeiro de Erila; haints podem aguardar fora. Chave com Visão 9 e captura com Destreza 7. | D/C. Chave T, sem vínculo mecânico entre recuperação e fechaduras da sala de brinquedos. |
| Playroom `playroom` e armário, mapa 12, pp. 23–25 | Porta ao corredor e porta interna do armário. Ambiente ilusoriamente acolhedor, baús trancados, círculo e cinco velas. | Chave, arrombamento ou dano abrem fechaduras. Brinquedos são presentes para haints. Conhecimento Arcano 9/11 ou pesquisa permite entender rito. Jaymes e ajuda condicional de haints no ritual. | D/C para `toys` e `ritual`. Ø para armário, baús e objetos persistentes por recinto. Ritual tem estado e comandos próprios. |
| Attic Stairway `attic-stairs`, mapa 13, p. 23 | Entre corredor e sótão, uma porta em cada ponta. Escada estreita. | Medo de altura/espaço fechado condiciona Coragem 11 e pode impedir subida. | D/T sem cena própria ou condição de passagem. |
| Attic `attic`, mapa 14, p. 24 | Porta à escada. Janelas, celas, brinquedos, camas e baldes, vozes e último verso. | Ossos 7/9; Eric e Bamala encontrados vivos, fracos até alimentação ou cura. Vara e estilingue. A fonte não confirma origem Fen de Bamala. Reação posterior a quem absorve centelha, pp. 25–26. | D/C, elenco fixo e descrição que já identifica crianças. Condição/objetos em texto. Definição ainda chama Bamala de Fen, divergência registrada no [Story Card](../../narrative/npcs/bamala_story_card_secundario.txt). |
| Grotto `grotto` e túmulos, p. 24 | Atrás da mansão, gruta artificial com hera, estátua mutilada e lápides. Acesso explorando terrenos ou reaparição a zero Saúde. | Chant na primeira chegada; presença posterior depende do que ocorreu. Examinar lápides identifica idades infantis. Reaparição com 1 Saúde e ainda criança. | D/C e exceção mecânica implementada. Túmulos T. A abertura da cena fala em primeira chegada, sem resolução genérica de visita ou de presença. |
| Barragem e saídas do leito, pp. 26–27 | Barragem próxima permite inundação. O livro não fornece planta de acesso ou distâncias. Sair do leito tem implicação distinta de sair do solar. | Enchente pode preservar vila e acampamento conforme manejo. Incêndio, dissipação, ritual e permanência da casa produzem resultados diferentes. Mud Mother pode auxiliar a restauração. | T/Ø para barragem e fronteira. Fatos de resolução em v3 e comandos locais não compõem automaticamente descrição/rotas de cada recinto. |

A planta confirma as quatro divisões físicas (térreo, porão, segundo andar e sótão). Na definição elas são inferíveis pelas ligações, sem nós de hierarquia. As 14 áreas numeradas mais o vestíbulo estão registradas, com 12 dessas 15 áreas atendidas por cena de localização própria. Adega, corredor superior e escada do sótão só têm registro e adjacências. O texto da p. 15 diverge na distribuição esquerda/direita das cinco portas em relação à ilustração da p. 16. Para navegação, a lista nominal da p. 17 e as saídas descritas em cada sala são referências mais úteis que inferir lados. Ligações macro como estrada–pântano e cenas de resolução agrupadas representam abstrações do recorte KHAOS. O PDF não define um mapa navegável completo dessas áreas externas.

## Evidências offline da recuperação

Rodaram **20 testes existentes** de integração de Gloamhale em PostgreSQL
descartável. Cobrem importação e sigilo iniciais, caminho v2 da estrada à vila,
identidade e memória por NPC, preparação futura privada, relógio e gruta,
ritual, alteração de mundo por adjudicação e preservação da definição.
Comando na raiz, com imagem Docker local:

```sh
PATH="$PWD/.tools/node_modules/.bin:$PATH" node scripts/test-integration.mjs --runTestsByPath test/integration/gloamhale.spec.ts
```

Uma fixture temporária fora do repositório repetiu o bootstrap dessa suíte
com `AiServiceClient.turn` simulado e capturou oito requisições PROPOSE,
incluindo o controle antes/depois do salão. A fixture importou um rascunho,
transcreveu/revisou a party, iniciou sessão e preparou cada cena via
`SCENE`. Em cada ponto chamou `NarrativeContextService.build` e enviou
a mensagem livre ao endpoint de ações. A chamada simulada devolveu OBSERVE,
sem executar as interpretações da matriz. Os payloads capturados foram
validados por `TurnRequest.model_validate` e projetados pelo
`planner_request` real. Quatro propostas sintéticas foram então executadas
somente na função pura `interpretFreeAction` com os snapshots capturados,
e uma composição inválida na função `validateRendering`. A fixture
terminou com sucesso. A captura é de requisição e de autorização offline,
sem inferência literária e sem chamada Gemini.

Em todos os casos, FREE trouxe Naelis, Aren, Mira e Lys disponíveis,
nomes e flags das localidades visíveis, inventário da protagonista,
referências de regras, objetivo exposto e até quatro entradas recentes
filtradas. A seleção não tinha fontes KNOWN nem capacidades de teste
nesses checkpoints. As fontes PUBLIC acumularam as descrições curtas
dos locais ativados anteriormente. A tabela mostra as diferenças de
cada checkpoint. O backend amplo continha adicionalmente o bloco
`adventure.gm`; essa diferença é relevante para interpretar os resultados.

| Cenário e preparação | O que o PROPOSE FREE recebeu | Dados indisponíveis ou divergência verificada |
| --- | --- | --- |
| 1. Primeira chegada a Lakesheart, `village` | Abertura genérica da vila, fonte “Povoado agrícola no leito drenado do lago Husqan”, estrada já ativada, Amos e Griseld disponíveis. | Casas novas, arado diante da taverna e camadas de observação da p. 9 não chegaram como fontes ou testes. Taverna, forja e lavouras constavam apenas em `gm.location.objects`. |
| 2. Entrada no prédio, `reborn` | Abertura genérica “Heroes Reborn” e fonte “Solar deteriorado com escadaria danificada”; sem cast local adicional. | Parquete, lustre, destinos das cinco portas e condições não aparecem nessa projeção. A preparação da cena não equivale a confirmar `GLOAMHALE_ENTER`, que é um comando distinto. |
| 3. Investigação do escritório, `study` | Abertura genérica e “Escritório apresentado por uma ilusão de conservação”; `checks=[]`. | Pastas, livros e níveis de Procurar não são fontes acessíveis. A fonte já nomeia a ilusão antes de uma descoberta. Uma proposta sintética `PREPARED_CHECK` para procurar registros devolveu ADJUDICATE / `UNSUPPORTED_CAPABILITY`. |
| 4. Exame do piano, `piano` | “Sala de piano e cortinas deterioradas”, fonte vinculada à Drawing Room. | Piano não era WORLD ou ITEM. Cartilha, cheiro graduado, diferença entre tecla e tampa e aparecimento do espectro ficaram indisponíveis como operações. O espectro constava do cast amplo como arquétipo, ausente dos atores FREE. OBSERVE apontando para WORLD/Piano devolveu CLARIFY / `CLARIFICATION_REQUIRED`. |
| 5. Procurar Chant na casa, `losing-chant` | Enit e Chantria disponíveis, fonte genérica da vila. | A casa e o quarto não eram alvos. A p. 11 exige a ausência de Chant. O replay de TALK/DIALOGUE para Chantria foi aceito como DIALOGUE / `STORY_CARD`, inclusive com texto de que ela ouviu a fala. Esta é uma autorização inconsistente com o encontro. |
| 6. Retorno ao salão, `feast` | Antes, “Refeitório com uma ilusão de banquete”. Depois de `WORLD_UPSERT` explícito e nova preparação, “Salão deteriorado após a dissipação”. A abertura foi igual nos dois checkpoints. | O novo texto chegou como PUBLIC. O status `ILLUSION_DISPELLED` existia na linha ampla, mas foi retirado da projeção FREE. A definição GM continuou com texto e sineta estáticos. A atualização testada veio do operador, e o código não deriva a variante da segunda visita por conta própria. |
| 7. Buscar segredo de Erila, `erila` | Erila nomeada e disponível. Fonte “Quarto de Erila; espelho mostra a deterioração real”. | A causa da morte constava na identidade privada do snapshot amplo e ficou fora da projeção FREE. QUERY com chave inventada devolveu CLARIFY / `INVALID_EVIDENCE`. O próprio texto público já entrega identidade e função do espelho sem condicionar o exame, e o ramo amplo pode ver os segredos de GM. |

O controle de publicação tentou inserir uma galeria atrás da estante.
Resultado `accepted=false`, razão `UNAPPROVED_SEGMENT`, apenas o
recibo confirmado na saída. Esse controle protege contra invenção de
passagem. Ele não corrige um ator indevidamente disponível ou uma descrição
que já chegou ao catálogo como pública.

Para reproduzir a fixture, use o setup de
[test/integration/gloamhale.spec.ts](../../../apps/api/test/integration/gloamhale.spec.ts)
e percorra `village → reborn → study → piano → losing-chant → feast →
WORLD_UPSERT(dining-room) → feast → erila`. Capture a chamada de
`turn` antes da resposta simulada. Aplique `planner_request` à requisição
FREE capturada. Use o contexto original na autorização NestJS para
comparar o alvo do piano, o check indisponível, o diálogo com Chant e a
evidência inventada. As passagens entre cenas são intervenções da fixture
para inspecionar a recuperação, sem representar uma rota liberada à jogadora.

## Lacunas por gravidade

| Gravidade | Lacuna | Evidência e efeito |
| --- | --- | --- |
| Crítica | Presença e autorização podem contradizer a cena | Chant disponível e resposta autorizada no desaparecimento. Erila também aparece por nome antes da identificação em jogo. |
| Alta | Segredo e fase de descoberta misturados ao texto público | Study e Dining Room nomeiam ilusões. Quarto de Erila anuncia quem e o que o espelho revela. O ramo de contexto amplo também recebe conteúdo de Mestre. |
| Alta | Grafo descritivo sem travessia e acesso operacional | Três áreas internas sem cena própria, sem hierarquia, portas sem condição, cenas optativas manuais. Reativar cena pode redefinir acessibilidade após interdição. |
| Alta | Objetos e pistas sem identidade consultável | Piano, chave, sineta e documentos não são alvos. Não há vínculo entre chave e fechaduras, entre observação e níveis do estudo, ou entre interação e revelação. |
| Alta | Alterações e revisitas incompletas | O estado amplo e a definição podem divergir. Atualização manual chegou ao FREE em texto, mas não houve derivação da visita, do estado ou do efeito para descrição e presença. |
| Média | Contexto amplo em locais já revelados | Recorte de 20 entidades sem ordenação ou vínculo com a sala. O contexto acumula locais anteriores e pode perder o prioritário conforme cresce. |
| Média | Detalhe espacial e divergências editoriais | Aberturas genéricas omitem elementos canônicos. Origem Fen de Bamala permanece não corroborada, registrada como divergência para uma revisão da definição. |

## Proposta para uma versão futura

Ampliar o schema da definição e a importação versionada existentes. Conservar
as chaves atuais quando a identidade é a mesma, acrescentar `parentKey`
para hierarquia e arestas com destino, tipo de passagem e condições. Cada
descrição deve indicar a fonte impressa e a condição de projeção. Começar
pelas áreas internas sem cena e pelas passagens de alto impacto, como
barricada, alçapões e escada estreita. Não inventar topologia para a barragem
ou rotas que o livro deixa abertas.

Separar fatos estáticos, estado da campanha e conhecimento. Reusar
`world_entities` para alvos físicos que realmente possam ser examinados e
o inventário para itens adquiridos. Objetos devem ter identidade e vínculo
com o local. Uma pista deve declarar a fonte, a ação ou teste necessário
e o evento que autoriza sua revelação. Reusar verificações, eventos e
associações de memória existentes. Preservar condição de acesso mesmo
quando uma visita revela a existência do lugar. Usar estado próprio por
instância para visita, presença, porta, ilusão e efeito, com transições
idempotentes. Reutilizar evidências do Director onde um estado já é
representado por fato confirmado.

Derivar o contexto prioritariamente do recinto atual, de suas saídas
relevantes e dos presentes. Resolver acesso e elegibilidade antes de
selecionar fontes. O modelo recebe somente descrições e ações pertinentes,
mais conhecimento próprio necessário. O material de Mestre fica no
servidor, inclusive no caminho SCENE, salvo o estritamente necessário
a uma operação aprovada. A publicação continua recompondo seus fragmentos
a partir dessas fontes. Story Cards e biblioteca contextual seguem como
fontes editoriais com autorização por identidade e cena.

## Critérios de prontidão para uma sessão jogável

1. Cobrir todas as áreas numeradas e o vestíbulo com percurso reprodutível.
   Verificar ida, volta e rotas alternativas descritas no livro, incluindo
   arestas bloqueadas, ausência de passagem e o retorno após mudança.
2. Cada elemento interativo relevante tem alvo estável e resultado
   condicionado. Testar piano, fruta, registros graduados, sineta,
   chave, brinquedos e versos, com falha e repetição.
3. Presença e fala acompanham fatos da sessão. Testar Chant ausente na
   casa, primeira chegada à gruta, retorno, resgate e elegibilidade de
   Erila. NPC ausente não entra no menu nem autoriza diálogo.
4. Estados de ilusão, portas e desfecho sobrevivem a reinício e revisita.
   Reativar cena não reabre acesso nem restaura uma ilusão sem evento.
5. Informação sensível permanece indisponível antes da fonte autorizada
   em API, PROPOSE, NARRATE e catálogo. Validar rejeição de evidência
   fabricada e preservar agência e autoria mesmo quando um evento altera
   o ambiente.
6. Executar uma rota sintética integral em banco descartável, com cena
   corrente, alvos, fatos, estado e texto publicado comparados ao livro.
   O limite de recuperação deve preservar local e saídas prioritárias
   com mais de 20 entidades conhecidas. Registrar separadamente o que
   ainda requer adjudicação humana.

**Resposta à pergunta obrigatória — PARCIALMENTE.** O backend sustenta
locais já preparados e pode recuperar descrições atualizadas pelo operador.
A cobertura é insuficiente para exploração livre fiel. O piano não pode
ser examinado como objeto, o estudo não oferece a investigação graduada e
Chant pode responder enquanto deveria estar desaparecida. A filtragem
impediu o acesso por chave inventada e a galeria foi recusada, mas o próprio
catálogo ainda pode revelar informações cedo demais. Só o relatório foi
adicionado ao repositório nesta auditoria.
