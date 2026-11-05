# Gloamhale v5 — Exploração espacial

A revisão 5 torna operáveis as passagens da mansão. A revisão usa as
descrições perceptíveis e as regras de presença e revelação da v4. Consulte
a [auditoria espacial](gloamhale-location-audit.md) e o
[relatório de integridade narrativa](gloamhale-narrative-integrity.md).

## Diagnóstico

A referência histórica tinha adjacências por chave. A resolução de ações
movia o grupo por `nextSceneKey`, que substituía o plano e ativava uma
cena. Isso deixava três ambientes sem entrada própria e acoplava chegada,
revisita e encontro. O contexto consultava até 20 entidades públicas sem
prioridade para o recinto atual. A autorização do Director tratava de
progresso por fatos e opções, sem representar a posição da protagonista.
Essas constatações foram comparadas com as pp. 14–24 e com a planta da
p. 16 do [PDF local de Six of Swords](../../references/blue%20rose%20-%20six%20of%20sword.pdf).

## Implementação

O `AdventureRegistry` registra a v5 para campanhas novas. A definição
ganha o campo opcional `spatial`. Seus lugares referenciam as chaves
existentes e guardam região e ambiente superior. As passagens têm
identidade, extremidades, tipo, condição e páginas. A validação verifica
chaves, destinos e ciclos de hierarquia. As v1–v4 não foram regravadas.

| Conceito | Representação |
| --- | --- |
| Existência conhecida | Visibilidade de `world_entities`. A projeção de saída oculta nomes de destinos ainda não divulgados e conserva o rótulo da restrição perceptível. |
| Local alcançável agora | Passagem desde a posição atual, destino existente, acesso válido no destino e em seus ambientes superiores. Um destino ainda desconhecido pode ser alcançável. |
| Passagem acessível | Condição canônica combinada com o registro local de abertura ou bloqueio. A confirmação local exige que a passagem esteja no local atual. |
| Entrada efetiva | Evento privado de chegada por campanha. Uma travessia da protagonista também produz `ADVENTURE_LOCATION_ENTERED` público com a descrição vigente. |
| Visita anterior | O histórico de chegadas fornece contagem, recinto anterior e indicação de revisita. A existência de um local no catálogo não conta como visita. |

O backend recebe uma seleção explícita de saída pelo mesmo mecanismo
de opções do chat, ou reconhece um pedido simples de travessia em
`ACT`. A autorização usa o texto e a opção originais da jogadora
antes de PROPOSE. Pedidos ambíguos, rotas compostas e destinos sem
passagem direta devolvem uma solicitação de esclarecimento quando
reconhecidos como tentativas de deslocamento. Uma proposta inventada
pelo modelo não é uma decisão da jogadora. Uma travessia exige
protagonista disponível e respeita bloqueios de combate e ritual.
A confirmação, o evento e o recibo do turno compartilham a transação.
Repetir o ID da ação não conta outra visita.

Ao chegar, a sessão abandona as opções e vínculos do encontro anterior.
A projeção usa o local persistido, mesmo sem linha em `adventure_scenes`,
e combina a descrição observável com as revelações v4 confirmadas.
O elenco usa presença persistida. Um encontro pode ser preparado
explicitamente pelo operador no local. Chegar ou revisitar não
prepara encontro por si só. A projeção prioriza o local antes de
consultar entidades públicas, com as saídas autorizadas em um
campo próprio. O Python usa uma lista explícita dos campos públicos
das passagens. NARRATE parte do recibo confirmado e da fronteira 5.6.2.

A navegação sincroniza a posição da protagonista com o recorte mecânico
da mansão quando a transformação já está ativa. Os comandos especiais
continuam disponíveis. Movimentos mecânicos confirmados e a transferência
para a gruta também atualizam a posição espacial. Companheiros
infantis em outra área mecânica ficam fora do contexto presente.
A pausa e a retomada mantêm a posição. O início de outro capítulo
reaproveita a posição confirmada se o operador não preparar uma cena.

## Inventário e restrições

As passagens são reversíveis quando há duas extremidades. A condição
de medo é aplicada à subida, e a autorização dessa subida é consumida.
Nas rotas abaixo, as portas e alçapões usam as pp. 16–24.

| Recinto | Ligações |
| --- | --- |
| Terrenos | Porta principal para o vestíbulo. Trilha para a gruta após confirmação local da descoberta, pp. 14–15 e 24. |
| Gruta | Trilha aos terrenos. A chegada também pode decorrer da exceção mecânica da mansão. Chant depende da presença autorizada. |
| Vestíbulo | Terrenos, sala de estar, sala de música, sala de jantar, cozinha, escritório e corredor superior. Escada principal danificada sob confirmação local. A progressão interna na primeira entrada aguarda `Heroes Reborn`. |
| Sala de estar | Vestíbulo. |
| Sala de música | Vestíbulo e estufa. |
| Estufa | Sala de música e alçapão do porão. Porta externa soterrada sem destino navegável. |
| Porão | Estufa e adega. |
| Adega | Porão e alçapão com escada à cozinha. Permite permanência sem encontro preparado. |
| Cozinha | Vestíbulo, sala de jantar e adega. |
| Escritório | Vestíbulo. A localização não libera documentos. |
| Sala de jantar | Vestíbulo e cozinha. A confirmação de dissipação persiste em revisitas. |
| Corredor superior | Vestíbulo, quarto principal, quarto da senhora, sala de brinquedos e escada do sótão. Permite permanência sem encontro preparado. |
| Quarto principal | Corredor superior. |
| Quarto da senhora | Corredor superior por porta barricada. A remoção dos móveis exige confirmação local. Identidade e espelho seguem os controles da v4. |
| Sala de brinquedos | Corredor superior. O armário e os baús continuam fora da navegação de recintos. |
| Escada do sótão | Corredor superior e sótão. A subida exige adjudicar medo e, quando aplicável, o teste canônico. Permite permanência sem encontro preparado. |
| Sótão | Escada do sótão. A identificação de Eric e Bamala continua condicionada. |

Estrada, Lakesheart, pântano e acampamento Fen mantêm suas chaves e
fluxos preparados. As conexões externas sem geometria precisa permanecem
sob adjudicação. A revisão não atribui distâncias ou duração automática
a uma travessia. Escada danificada, remoção da barricada, descoberta
da trilha e medo são tratados por `CONFIRM_PASSAGE` com justificativa
local. Esse comando registra a decisão já adjudicada. O catálogo
de objetos e a investigação graduada permanecem fora do recorte.
O reconhecimento textual é deliberadamente limitado a pedidos simples
com destino ou passagem identificáveis. Outras formulações podem
exigir a seleção da saída na interface.

## Arquivos

- `apps/api/src/adventures/definition.ts`, `gloamhale-v5.ts`,
  `adventure-registry.module.ts`, `default-adventure.ts` definem e
  registram o grafo.
- `apps/api/src/adventures/spatial.ts`, `state.ts`,
  `narrative-integrity.ts`, `adventure.service.ts`,
  `gloamhale-runtime.ts` cuidam das chegadas, passagens, presença e
  integração com comandos locais.
- `apps/api/src/sessions/sessions.service.ts` mantém posição e
  continuidade entre sessões.
- `apps/api/src/narrative/context.service.ts`, `mentions.ts`,
  `narrative.service.ts`, `resolution.service.ts` projetam o
  contexto e autorizam a travessia.
- `apps/ai-service/app/narrative/selection.py` projeta a navegação no
  PROPOSE FREE. A alteração de código exige um manifesto próprio para
  uma futura avaliação ao vivo.

## Validação offline

- **50 testes NestJS aprovados** em três suítes com PostgreSQL descartável
  e IA simulada. A rota v5 testa saída inexistente, decisão ausente,
  autorização e fechamento persistente de passagens, deslocamento por
  texto e opção, revisita, pausa e retomada, personagens condicionais,
  revelações, prioridade com 24 entidades remotas e comando local de tempo
  em recinto sem encontro. As suítes incluem as regressões da v4, Story
  Cards e publicação.
- **7 testes Python aprovados** em `test_contextual_dialogue.py` e
  `test_phase55.py`, incluindo a filtragem dos dados espaciais enviados
  ao PROPOSE.
- Tipagem da API, ESLint direcionado e verificação Ruff aprovados.
- A rodada usou dados de teste, sem chamadas reais ao Gemini.

Reprodução das suítes NestJS a partir da raiz do repositório:

```sh
PATH="$PWD/.tools/node_modules/.bin:$PATH" node scripts/test-integration.mjs --runTestsByPath test/integration/gloamhale.spec.ts test/integration/phase55.spec.ts test/integration/story-card-dialogue.spec.ts
```
