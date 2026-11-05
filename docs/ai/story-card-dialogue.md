# Story Cards e diálogo contextual — contrato opt-in v1

Implementação da Fase 5.6.3B.1, sobre a biblioteca [G1/G2](contextual-dialogue.md).
A referência da aventura, o elenco instanciado e `characters` são origens distintas.
Não há criação, conversão de ficha, associação por nome ou cópia de memória.

## Preparação local

O operador usa o comando administrativo existente `SCENE`, pela CLI
`adventure:command`, com arquivo JSON revisado. Nenhum comando deve ser enviado
pelo modelo ou pela API pública de ações. A CLI não foi executada contra campanhas
reais nesta entrega.

`SCENE.storyCardDialogue` admite:

- Omitido: reaplica o manifesto anterior somente se ainda corresponder à mesma
  campanha, definição/digest registrado e armazenado, namespace e cena.
- Manifesto v1: tenta aplicar a autorização explícita à cena solicitada.
- `null`: revoga o vínculo; a propriedade não permanece no plano.

O manifesto fica em `scenePlan.storyCardDialogue`, no JSONB existente:

```text
bindingVersion: 1
campaignId: UUID da instância
definitionId: id:vN
definitionDigest: SHA-256 da definição validada na importação
entityNamespace: namespace persistido, também conferido com o módulo registrado
sceneKey: uma única cena autorizada
provenance: {authorId, source, reviewed: true}
bindings: [
  {
    characterKey, entityId,
    libraryId: "khaos-dialogue", contentVersion: 1,
    voiceId: "RESERVED" | "WARM",
    expectedState,
    choices: [{topic, act}],
    sources: [{key, kind, referenceId, descriptionHash}],
    provenance: {authorId, source, reviewed: true}
  }
]
```

Campos e limites são os schemas estritos de `shared-contracts/src/dialogue.ts`.
O rascunho B.0 não é esse contrato: seus campos não são copiados como se já fossem
válidos. O contrato atual tem um escopo de cena único e pares explícitos de
assunto/ato, além da identidade/versão da instância. O JSON de planejamento B.0
permanece intacto; o helper de testes constrói o novo manifesto formalmente.

A definição registrada e a referência persistida são revalidadas com o mesmo
schema usado na importação antes do digest. Isso restaura a ordem das chaves do
contrato após um roundtrip JSONB, sem mudar o algoritmo de digest, os dados ou o
hash histórico. Namespace e UUID continuam usando `adventureEntityId` existente.

Um vínculo inválido não habilita respostas. Versões desconhecidas são recusadas
na entrada administrativa; dados já armazenados incompatíveis falham fechados na
leitura e não são reaproveitados. Duplicidade de key/UUID invalida o manifesto,
sem escolher uma autorização arbitrária. Trocar de cena descarta o manifesto;
voltar à cena anterior exige novo opt-in, pois a permissão não é um catálogo global.

## Elegibilidade e fontes

O carregador `narrative/story-card-dialogue.ts` verifica sessão em andamento,
instância, versão registrada, digest, namespace, cena e identidade. O card precisa
ser `INDIVIDUAL`, conhecido e presente, com estado literalmente igual ao revisado.
Estado narrativo não é Saúde e não é interpretado por regex. Uma colisão de UUID
com `characters` recusa o caminho novo, sem criar um personagem sombra.

As fontes vêm de consultas próprias da origem:

- Memória: somente associação `(campanha, characterKey, eventId)` em
  `adventure_memories` com evento PUBLIC da mesma campanha. Projeta-se HEARD;
  associação e tipo de evento não provam testemunho, participação ou autoria.
- Fonte de cena: somente o local atual da aventura, público, acessível e com
  descrição integral exatamente vinculada. O schema atual não comprova vínculo
  objeto→sala; outros objetos/locais não são admitidos neste recorte.

Fontes têm digest da descrição integral. Ausência, alteração, acesso indevido ou
fonte de outro NPC removem a réplica. Não se faz busca alternativa por nome.
`promise` v1 exige SPEECH_RECORDED: NPC_REPLY_RECORDED não é renomeado para
satisfazer essa condição. A citação registra o que foi ouvido, sem provar
cumprimento ou atribuir a promessa ao interlocutor.

Os fragmentos de desacordo pessoal continuam exigindo WITNESSED e participação.
O adaptador nunca cria essas provas a partir de memória legada, CONSEQUENCE_RECORDED
ou currentState. Esses fragmentos ficam indisponíveis; a conversa pode usar
esclarecimento ou conteúdo geral autorizado. Nenhuma memória histórica é editada.

## Modelo, publicação e memória

PROPOSE recebe apenas o menu público de nomes e pares assunto/ato. Resolução por
menções mantém o UUID exato de homônimos. O manifesto completo não entra no menu.
O metadata privado da ação distingue a origem STORY_CARD; não a confunde com uma
FK de personagem regular. O caminho REGULAR e seus contratos permanecem iguais.

Para NARRATE, a projeção nova remove origem interna, owner e proveniência
administrativa. A biblioteca fornece somente beats completos, fatos próprios
públicos e a identidade/voz pública. O servidor conserva o contexto completo para
reconstruí-lo na transação e conferir texto, speakerId, factIds, versão, estado,
fontes e escopo. Não aceita paráfrase ou combinação de alternativas contextuais.
RESULT mecânico continua literal. A [fronteira 5.6.2](narrative-renderer.md) permanece.

A mensagem aceita recebe proveniência privada do conteúdo/vínculo/owner, omitida
pelo DTO público. O novo evento NPC_REPLY_RECORDED guarda atribuição pública
mínima `{speaker: {kind: "STORY_CARD", entityId}}`, sem manifesto, namespace ou
digest. Essa informação é metadado, não FK de participante. O comando interno
EVENT_RECORD aceita a atribuição somente para esse tipo de evento; não é uma
capacidade FREE nem altera a mecânica do motor.

`rememberReply` grava somente a fala efetivamente publicada. Os participantes
relacionais continuam sendo regulares; o cast usa `adventure_memories`, por key.
A mensagem, evento e associações da réplica compartilham a transação. Falha
reverte a réplica; retry retoma NARRATE, conservando a fala da protagonista já
confirmada e sem duplicá-la. Ausentes/arquétipos não recebem a fala pelo novo vínculo.

Não há mudança de Saúde, inventário, confiança, consentimento, objetivos ou
progressão extraída da prosa. O manifesto declara revisão local; hash comprova
integridade, não a verdade ou pertinência semântica de uma fonte mal preparada.

## Implantação e rollback

Não há migration/dependência nova, atualização de Gloamhale ou habilitação por
personalidade. Instalar contratos/API como um artefato coerente; Python de produção
não precisou mudar. Os schemas FREE/NARRATE entre os runtimes permanecem iguais.

Para desativar, drenar turnos pendentes e usar `SCENE.storyCardDialogue: null` nas
cenas habilitadas, mantendo a proteção 5.6.2. Manter eventos, chats, IDs e memórias;
não repetir mecânicas nem restaurar banco para refazer texto. Ao retornar a um
binário anterior, limpar os manifestos novos antes de trocar contratos estritos.
Nenhum deploy ou rollback real foi executado.

[Validação, matriz e limitações](../testing/phase-5.6.3b-1-validation.md).
