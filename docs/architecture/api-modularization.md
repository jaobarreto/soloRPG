# Modularização da API NestJS

## Estrutura anterior

- `adventures/` reunia conteúdo editorial, definições versionadas, registro, importação, Director, estado, navegação e execução. A navegação misturava o grafo e a gravação de visitas com o relógio, o ritual, os nomes dos cômodos e as restrições da mansão.
- A política de integridade de Gloamhale era consultada diretamente pelo Game Engine e por vários caminhos narrativos. A preparação, as menções, a memória e os Story Cards interpretavam as mesmas regras de presença. O contexto narrativo conhecia também o JSON privado da transformação infantil.
- A transcrição genérica reconhecia Naelis por uma chave fixa para decidir seu papel e o nome de sua arma. As seleções padrão e o namespace histórico apareciam em consumidores genéricos.
- O motor concentrava a transação de comandos, a persistência e parte das regras de teste e ficha. As durações de repouso apareciam em dois pontos. O módulo do motor também declarava os provedores de arcanos, combate e testes.

## Organização atual

```text
apps/api/src/
├── app.module.ts
├── adventures/
│   ├── admin.ts
│   ├── adventure-registry.module.ts
│   ├── core/
│   │   ├── definitions/           # schema e importação versionada
│   │   ├── director/              # Director e condições de progressão
│   │   ├── navigation/            # grafo, passagens, visitas e travessia
│   │   ├── operations/            # AdventureModule, comandos e revisão da party
│   │   ├── registry/              # registro, contrato da aventura e política de cena
│   │   ├── scenes/                # preparação, ativação, contexto, memória e vínculos
│   │   └── state/                 # referências persistidas, snapshots e identidade
│   └── gloamhale/
│       ├── definitions/
│       │   ├── v1/                # referência, NPCs, locais, encontros e cenas
│       │   ├── v2/
│       │   ├── v3/
│       │   ├── v4/
│       │   └── v5/
│       ├── party/                 # fichas fornecidas e metadados da transcrição
│       ├── runtime/
│       │   ├── commands/         # comandos locais e confirmação de presença/revelação
│       │   ├── mechanics/        # transformação, relógio, ritual e política de travessia
│       │   └── state/            # validação do estado privado e integridade narrativa
│       ├── default-adventure.ts
│       ├── gloamhale-module.ts    # adaptação do runtime ao contrato do registro
│       └── gloamhale.module.ts    # provedor NestJS das versões
├── blue-rose/
│   ├── arcana/                    # regras, preparação, execução e cura arcana
│   ├── mechanics/
│   │   ├── combat/
│   │   ├── dice/
│   │   ├── recovery/
│   │   └── tests/
│   ├── sheets/                    # validação de fichas e de características
│   └── blue-rose.module.ts
├── game-engine/                   # comandos, transações, auditoria e idempotência
├── characters/                    # consultas e projeções de personagem
├── campaigns/                     # criação, consulta e atualização de campanhas
├── sessions/                      # ciclo de vida das sessões
├── narrative/                     # contexto, autorização, resolução e publicação
├── messages/                      # persistência e rotas de mensagens
├── database/                      # conexão, esquemas e repositório mecânico compartilhado
└── integrations/                  # cliente da orquestração de IA
```

Os diretórios agrupam responsabilidades TypeScript. Os módulos NestJS ficam nos pontos de composição e de compartilhamento de provedores. `AdventureRegistryModule` recebe as versões exportadas por `GloamhaleModule` e fornece uma instância do registro. A composição seleciona v1 para o comando de importação legado e v5 para criação pública. Campanhas existentes mantêm sua referência persistida.

## Matriz de dependências

| Origem              | Dependências permitidas no recorte                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blue Rose           | Banco e contratos compartilhados. Os serviços usam os tipos de comando e contexto transacional do motor.                                                                                |
| Núcleo de aventuras | Registro, contratos, banco e serviços/regras de Blue Rose. O adaptador de operações chama o motor na mesma transação. A progressão usa o identificador de etapa narrativa já existente. |
| Gloamhale           | Contratos e funções reutilizáveis do núcleo, regras de Blue Rose e banco.                                                                                                               |
| Game Engine         | Banco, serviços de domínio, Blue Rose e registro. Consulta políticas por versão, inclusive para proteger localidades canônicas.                                                         |
| Campanhas e sessões | Repositórios, estado e referências de aventuras, composição NestJS do registro e serviços comuns de cena e progressão.                                                                  |
| Narrativa           | Motor, campanhas, sessões, mensagens, banco e projeções de aventuras. A presença de membros da party é entregue separadamente do contexto serializado.                                  |
| Banco               | Conexão, esquemas Drizzle e persistência compartilhada.                                                                                                                                 |
| Composição NestJS   | Conecta as implementações de aventuras ao registro. É o ponto que conhece o módulo concreto de Gloamhale.                                                                               |

Os testes arquiteturais percorrem os subdiretórios, resolvem imports relativos, inclusive imports de tipo, e verificam que a implementação compartilhada fica livre de referências canônicas da aventura.

## Movimentações e extrações

| Antes                                                                                             | Destino e responsabilidade                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blue-rose/{arcana*,combat*,tests.service,recovery.rules,blue-rose.rules,sheet-validation}`       | `arcana/`, `mechanics/{combat,tests,recovery,dice}/` e `sheets/`. Dados e resolução básica de testes ficaram separados.                                                                                                                   |
| `game-engine/game.repository.ts`                                                                  | `database/game.repository.ts`. `DatabaseModule` fornece a mesma implementação ao motor, a personagens e a Blue Rose.                                                                                                                      |
| Casos de teste básico e rolagem livre no motor                                                    | `BlueRoseTestsService` calcula a rolagem e usa `GameContext.recordRoll` para persistência e publicação. Validação de características migrou para `sheets/`. Uma tabela de durações de repouso atende o relógio e o evento de recuperação. |
| `adventures/{registry,definition,import,director,progression,adventure.service,party-validation}` | `core/{registry,definitions,director,operations}/`. A transcrição recebe o papel, o estado inicial e o nome especial de equipamento do preset registrado.                                                                                 |
| `adventures/{state,execution,story-dialogue,spatial}`                                             | `core/{state,scenes,navigation}/`. Estado persistente e cenas ganharam arquivos distintos. A navegação executa a travessia e registra revisitas.                                                                                          |
| `adventures/gloamhale*.ts`, `supplied-party.ts`, `narrative-integrity.ts`                         | `gloamhale/{definitions,party,runtime}/`. A base v1 separa os blocos editoriais, e cada versão seguinte conserva sua composição. Objetos, inimigos e falas vinculados a encontros ou cenas permanecem junto às suas fontes na definição.  |
| Condições canônicas de cena, presença e travessia                                                 | `ScenePolicy` e `NavigationPolicy` entregam os comportamentos que já variavam por aventura. Gloamhale implementa revelações, presença e travessia sob as mesmas transações.                                                               |

O catálogo de respostas em `narrative/dialogue-content.ts` usa vozes, tópicos e fontes genéricos. As falas e os perfis específicos de Gloamhale pertencem às suas definições e fichas, com autoria preservada em `docs/narrative`. G1/G2, a ativação por vínculo de Story Card e a política de publicação 5.6.2 mantêm a separação entre contexto de planejamento e recibo de publicação.

## Identidade das cinco versões

O ID lógico é `six-of-swords-gloamhale`. A referência persistida concatena esse ID e `:vN`. O namespace histórico continua sendo `gloamhale`, inclusive na derivação dos UUIDs. A tabela registra a linha de base obtida antes da edição e conferida após o build.

| Versão | Bytes de `JSON.stringify` | SHA-256 persistido                                                 |
| ------ | ------------------------: | ------------------------------------------------------------------ |
| v1     |                     49245 | `e61c692d23398d49d506a0a311073c099818c07f78591f174ba9aef4de0a54aa` |
| v2     |                     51008 | `06c6aa8ed9b7e9de14f1ea6e87688633238858bd4fd3f0205ddadee8811bb577` |
| v3     |                     57561 | `885f2f008f912e586156db94c182fed651dbb6cbeadb0abe01a6ba7c8e7c193d` |
| v4     |                     57291 | `ae46c714507564ef25fc1403a4fc0895b1d8e859b8593950add798d1ab677e99` |
| v5     |                     61229 | `9b2a7de38a4ed40373a1dce3f7f3d79fdf7b14601ffd91271ba2e5031b15f770` |

A comparação usa os objetos após validação pelo registro. Para reproduzir uma comparação binária com as duas árvores compiladas, passe os caminhos absolutos dos respectivos `apps/api/dist`. O módulo do registro pode ser instanciado sem banco.

```sh
node - "$ANTES_DIST" "$DEPOIS_DIST" <<'JS'
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const [before, after] = process.argv.slice(2);

async function serialize(root, registryPath) {
  const load = createRequire(root + '/app.module.js');
  load('reflect-metadata');
  const { NestFactory } = load('@nestjs/core');
  const { AdventureRegistryModule } = load('./adventures/adventure-registry.module');
  const { AdventureRegistry } = load(registryPath);
  const app = await NestFactory.createApplicationContext(AdventureRegistryModule, {
    logger: false,
  });
  try {
    const registry = app.get(AdventureRegistry);
    return [1, 2, 3, 4, 5].map((version) =>
      Buffer.from(JSON.stringify(registry.get('six-of-swords-gloamhale', version).definition)),
    );
  } finally {
    await app.close();
  }
}

(async () => {
  const original = await serialize(before, './adventures/registry');
  const current = await serialize(after, './adventures/core/registry/registry');
  current.forEach((bytes, index) => {
    if (!bytes.equals(original[index])) throw new Error('Versão divergente: ' + (index + 1));
    console.log(index + 1, bytes.length, createHash('sha256').update(bytes).digest('hex'));
  });
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
JS
```

O teste `test/adventure-history.spec.ts` fixa os cinco digests e os seletores de versão. A regressão em PostgreSQL verifica a importação, o digest armazenado, a reabertura com o ID da versão original e a seleção de v5 pela rota pública. `importAdventure` conserva a recusa a sobrescrever uma referência com digest divergente.

## Contratos e verificação

- A captura OpenAPI gerada a partir dos dois builds foi idêntica byte a byte. A comparação não abriu portas e usou apenas valores de configuração de teste.
- O contrato de mensagens, os esquemas e migrações, as regras de autorização e os artefatos autorais foram preservados. A única referência externa à API ajustada é o caminho de `story-dialogue.ts` na preparação de futuros inventários de arquivos da avaliação Python.
- Tipagem, lint e build limpo da API passaram. A suíte unitária atual passou em 25 suítes e 347 testes. A matriz Jest reuniu a suíte unitária e a integração em PostgreSQL descartável, com as migrações do repositório e clientes de IA simulados. A linha de base teve 543 aprovações e uma falha em 544 testes. A falha era o teste arquitetural que detectava o tipo de Gloamhale no contexto narrativo. A árvore final passou nas 38 suítes e nos 547 testes. Ela exercita combate, arcanos, recuperação, fichas, Game Engine, Director, progressão, Story Cards, publicação 5.6.2, navegação v5, integridade v4/v5 e continuidade de campanhas.
- Contratos compartilhados passaram nos sete arquivos de teste. A seleção Python offline de PROPOSE/NARRATE, publicação e Story Cards registrou 41 aprovações e sete recusas do preflight do executor semântico, com o mesmo resultado antes e depois. As sete recusas têm código `FROZEN_FILE_DRIFT` e ocorreram no preflight. A seleção adicional de canonicidade, seleção e executor literário registrou 173 aprovações e as mesmas 31 falhas de validação histórica em cada árvore. Três casos de cópia da fixture passaram de divergência de hash para caminho histórico inexistente.

Para repetir as verificações da API pelo workspace:

```sh
pnpm --filter @solo-rpg/shared-contracts build
pnpm --filter @solo-rpg/shared-contracts test
pnpm --filter @solo-rpg/api typecheck
pnpm --filter @solo-rpg/api lint
pnpm --filter @solo-rpg/api build
pnpm --filter @solo-rpg/api test
pnpm test:integration
```

Nesta execução, o pnpm disponível tentou reinstalar as dependências. Foram usados os binários já instalados de TypeScript, ESLint e Jest, com o mesmo runner `scripts/test-integration.mjs` para provisionar e remover o banco de teste.

## Evidência histórica e limites

Os recibos, hashes e manifestos anteriores permanecem evidência da árvore que avaliaram. Os preflights de conclusão da Fase 5.6.1 e da Fase 5.6.1.2 incluem caminhos antigos. A Fase 5.6.3b registra caminhos em seus recibos e resumos. A Fase 5.6.3c.1 usa a fotografia `baseline-sha256` e os manifestos do executor literário e do executor semântico. Uma nova rodada dessas avaliações que valide arquivos de produção precisa de inventário e manifesto próprios, com caminhos, fontes e compilados da revisão escolhida. A comparação de digests de definições tem finalidade distinta e continua válida após movimentar arquivos.

O manifesto histórico do executor semântico já divergia em `selection.py`, `context.service.ts`, `narrative.service.ts` e `story-card-dialogue.ts` na linha de base. O caminho antigo de `adventures/story-dialogue.ts` também deixa de resolver na árvore reorganizada. A validação continua recusando o replay desse manifesto. As suítes offline usam fixtures e provedores simulados, sem campanha real e sem chamada ao Gemini.

O núcleo ainda compartilha o modelo de fichas, comandos e dados de Blue Rose. A aplicação transacional do repouso continua junto da Cura no serviço de arcanos porque atualiza a mesma saúde, fadiga e disponibilidade de conjuração. As regras puras de recuperação ficam em `mechanics/recovery`. Um segundo sistema exigirá revisão desses pontos de acoplamento. Uma segunda aventura Blue Rose pode usar o registro atual sem alterar o motor ou a narrativa.

## Registrar outra aventura Blue Rose

1. Criar uma definição versionada com ID e namespace próprios. Manter a definição imutável depois de importada e publicar nova versão para alterações de conteúdo.
2. Exportar a lista de versões em um provedor do módulo da aventura. Usar o contrato existente `AdventureModuleDefinition`. Implementar políticas de cena e navegação, ou comandos locais, quando a aventura precisar deles.
3. Importar o módulo e acrescentar suas entradas na fábrica de `AdventureRegistryModule`. Selecionar a nova aventura explicitamente no CLI por ID e versão, ou configurar os seletores na composição se o produto mudar a referência padrão.

```ts
// Esboço da fábrica após a injeção do provedor de uma segunda aventura.
return new AdventureRegistry([...gloamhale, ...segundaAventura], {
  legacyImport: defaultAdventure,
  newCampaign: currentAdventure,
});
```

Os testes de registro e a fixture independente `test-lantern` demonstram importação, preparação, continuidade, progressão e memória com uma aventura distinta.
