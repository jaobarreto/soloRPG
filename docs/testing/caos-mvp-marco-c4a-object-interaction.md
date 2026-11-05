# CAOS · Marco C.4A

## Objeto e fonte

A **carroça tombada** foi escolhida por aparecer na primeira parte de _The Mistress of Gloamhale Manor_, na cena **A Foiled Trap**, página impressa 7 de _Six of Swords_. A passagem descreve a carroça bloqueando a via e os fios mal escondidos estendidos sobre a estrada, à frente dela. A adaptação de Gloamhale já incluía a carroça e os fios na abertura do encontro e na descrição da estrada. O texto autoral da viagem permanece idêntico. A carroça só fica disponível após a apresentação autorizada da cena da estrada.

A revisão `gloamhale-road-objects-c4a-v1` registra a fonte, o estado tombado, a localização na estrada, os nomes pelos quais a jogadora pode identificar o alvo e os fatos de cada interação. O fragmento de observação descreve a obstrução e os fios visíveis. O exame confirma onde os fios passam em relação à carroça. A página não exige rolagem para identificar esses fios. O fragmento de revisita reconhece o exame já feito. Nenhum desses fragmentos atribui dono, carga, material ou conteúdo à carroça.

A fonte trata a descoberta das pessoas em emboscada como investigação separada. Também prevê Empatia para avaliar a sinceridade do relato dos moradores. Os dois elementos continuam fora do exame. O registro editorial guarda essa distinção no servidor, fora das respostas públicas e do contexto de composição para o objeto.

## Resolução e publicação

O núcleo de aventuras resolve a tentativa contra o catálogo versionado. O catálogo de Gloamhale registra uma identidade canônica. Cada execução deriva seu próprio identificador estável a partir dessa chave e da identidade da campanha. Para a carroça, o alvo deve estar no local atual acessível e a apresentação deve constar no diário publicado. Um fragmento ainda aguardando a publicação do lote não basta. Uma referência ambígua pede esclarecimento. Uma tentativa anterior à apresentação ou depois de deixar a estrada também recebe esclarecimento, sem revelar dados do objeto ausente.

A jogadora escreve em linguagem natural no modo **Ação**, usando, por exemplo, “Quero examinar essa carroça” ou “Inspeciono a carroça tombada de perto”. **Enviar** grava a mensagem na fila. **Continuar** interpreta a tentativa, confirma o alvo e publica o resultado no diário. Uma observação simples e uma consulta dirigida a **Una** devolvem o fragmento perceptível. **Fala** segue o fluxo de interlocutores existentes e não examina fisicamente o objeto. **Pensamento** fica no diário privado. **Pedir teste** informa a ausência de teste adicional preparado para o exame simples. Uma rolagem isolada não libera dados da carroça.

O backend autoriza o fragmento e os eventos antes de chamar **NARRATE**. Para o objeto, Una recebe o resultado autorizado e um contexto de publicação sem notas privadas, elenco, dificuldades ou fatos de outras cenas. A fronteira 5.6.2 exige o fragmento aprovado. Uma resposta que acrescente pistas, ações, efeitos ou eventos é rejeitada e substituída pelo resultado oficial. Os lotes conservam a apresentação literária da continuação aprovada no A.1.3.1.

## Persistência, compatibilidade e reinício

O primeiro exame grava um evento `ADVENTURE_OBJECT_EXAMINED` de visibilidade `PLAYER_ONLY`, com identificador e revisão do objeto. O recibo da ação vincula o evento à narração e registra o conhecimento da protagonista. Companheiros e NPCs não recebem memórias automáticas. Uma repetição ou nova visita consulta o evento persistido e usa o fragmento de reconhecimento. O evento não constitui evidência dos objetivos da Sessão I e não altera Saúde, recursos, inventário, armadilhas, deslocamento ou tempo.

A criação ou o reinício da execução guiada fixa a revisão do objeto em um recibo privado. O reinício remove os eventos e o diário da execução anterior e prepara a mesma carroça no estado inicial, com nova identidade de execução. A biblioteca e os seis bloqueios editoriais permanecem. Execuções existentes mantêm os recibos que já possuíam. Partidas iniciadas antes do C.4A podem acessar a interação ao começar uma nova execução pelo reinício explícito. A implementação reutiliza as tabelas de comandos, eventos e conhecimento, sem migração de esquema. Os arquivos históricos e os digests de Gloamhale v1–v5 permanecem intactos.

## Verificação offline

- **PostgreSQL descartável e cliente de IA simulado** — 58 testes passaram em sete suítes. A integração exercitou o exame antes e depois da apresentação, os modos de interação, a localização incorreta, pausa e retomada, pedidos repetidos, o reinício, as composições solo e com três companheiros e o encerramento por Lakesheart e pela rota direta ao pântano. Os testes do resolvedor cobriram nomes alternativos, ambiguidade e referências ausentes. A publicação rejeitou uma resposta simulada que inventava uma chave e o disparo da armadilha. As regressões de reinício, fronteira 5.6.2, arquitetura e digests históricos passaram.
- **Chromium com Next, Nest, PostgreSQL descartável e Una simulada via HTTP** — um percurso completo passou. O teste abriu uma partida limpa, conferiu a abertura sem carroça, apresentou o encontro, enviou um exame em Ação, verificou a fila sem resposta antecipada, processou a tentativa, recarregou o diário, reiniciou e confirmou um primeiro exame novamente na nova execução.
- **Verificação estática** — build da API, tipagem web, lint do recorte e `git diff --check`.

Nenhuma chamada ao Gemini foi realizada. A cobertura trata somente da carroça. A seleção de alvos aceita nomes e formulações reconhecidas para observação e exame, com esclarecimento quando a referência ou a ação não puder ser confirmada. Manipulação, coleta, desarme, investigação da emboscada, resultados graduados e um catálogo mais amplo ficam para etapas posteriores. O C.5A deverá integrar evidências dependentes de testes e suas condições de revelação.

## Referências no projeto

- [Localização na adaptação](../adventures/six-of-swords/locations.md)
- [Registro autoral da carroça](../../apps/api/src/adventures/gloamhale/road-objects.ts)
- [Resolvedor do núcleo de aventuras](../../apps/api/src/adventures/core/objects/scene-objects.ts)
- [Suíte de integração](../../apps/api/test/integration/scene-object.spec.ts)
- [Percurso Chromium](../../apps/web/e2e/scene-object.mjs)
