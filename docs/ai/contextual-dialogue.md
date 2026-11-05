# Réplicas contextuais autorizadas — v1

Recorte G1/G2 da Fase 5.6.3B. A biblioteca é conteúdo de autoria local do
servidor; o modelo seleciona texto, não o escreve. Continua valendo o
[ADR 0011](../adr/0011-publicacao-narrativa-por-fragmentos-autorizados.md).

## Conteúdo e preparação

`apps/api/src/narrative/dialogue-content.ts` contém a biblioteca
`khaos-dialogue`, `contentVersion: 1`, com identidades estáveis por
assunto/ato/voz/variante. Uma alteração de conteúdo destinado a campanhas
existentes deve ser uma versão explícita, com revisão de compatibilidade.
`RESERVED` e `WARM` são perfis preparados; nenhum rótulo de personalidade,
amizade ou motivação habilita conteúdo automaticamente.

O campo opcional `scenePlan.dialogue` reutiliza o JSONB de preparação existente.
Cada vínculo estrito identifica personagem, biblioteca/versão, voz,
`expectedState`, assuntos habilitados, referências de fonte com SHA-256 da
descrição integral e proveniência do preparador (`authorId`, `source`,
`reviewed: true`). Não há migração, importação de aventura ou nova tabela.
Campanhas sem esse campo continuam no caminho anterior. O recorte v1 usa os
personagens regulares; o cast instanciado de Story Cards continua no caminho
anterior e precisa de adaptação explícita antes de receber vínculos.

A biblioteca separa oito atos: resposta, dúvida, discordância, esclarecimento,
cautela, retomada, recusa e desconhecimento. Há quatro assuntos preparados:
conversa geral, desacordo, promessa e entorno. Uma chave não habilita qualquer
resposta sobre aquele assunto: cada fragmento declara seus requisitos.

- Desacordo: estado público `UNRESOLVED`, fonte própria `WITNESSED`, evento
  `CONSEQUENCE_RECORDED` público, participação do interlocutor registrada no
  evento e descrição exata vinculada. Conhecer o conflito de outro personagem
  não autoriza descrevê-lo como conflito próprio.
- Promessa: fonte própria `HEARD`, evento público `SPEECH_RECORDED`; citação
  integral atribuída. Cumprimento ou ajuda não são inferidos.
- Entorno: descrição pública de objeto acessível, referenciada integralmente.
- Conversa: variantes sem afirmação de resultado material, habilitadas somente
  no perfil e estado preparados.

O preparador precisa revisar a associação semântica entre assunto e fonte.
`reviewed: true` registra uma declaração de autoria local, não uma certificação
automática. Hash comprova identidade do texto, não que o texto trata de promessa
ou desacordo. Esta implementação não fornece editor, importador ou juiz LLM.
Entradas FREE nunca podem criar vínculos, fornecer textos, fontes ou efeitos.

## Caminho de seleção e autorização

1. NestJS filtra por campanha, personagem resolvido, presença, estado, escopo,
   propriedade/modalidade/visibilidade de memória, acesso público e digest atual.
   Fontes de memória devem também estar no conhecimento recuperado pela política
   existente. Nenhuma busca, resumo ou retenção de memória foi substituída.
2. PROPOSE recebe por NPC somente o menu `{name, choices: [{topic, act}]}`.
   Os seletores opcionais do DIALOGUE são pedidos; NestJS exige o par completo
   e verifica o menu pelo ID do interlocutor resolvido. Assunto/ato inexistente
   vai para CLARIFY sem inventar conteúdo. O diálogo legado continua permitido.
3. NARRATE recebe réplicas completas do par solicitado e catálogo autorizado.
   Cada réplica inclui ID/versão/voz/proveniência/referências e um beat normal:
   `kind`, `speakerId`, `factIds`, `text`. Não há novo comando no NARRATE.
4. O servidor recompõe tudo dentro da transação existente. A publicação exige
   igualdade integral de texto, tipo, interlocutor e fatos. Com seleção
   contextual, exige exatamente um beat DIALOGUE completo: variantes alternativas
   não podem ser somadas para produzir uma declaração não revisada. Isso é uma
   restrição de autorização, sem planejamento de beats G3.
5. Falha usa o fallback determinístico anterior; a memória recebe somente a fala
   efetivamente publicada. Modalidade HEARD, idempotência e resultado mecânico
   literal permanecem. A proveniência do fragmento aceito é gravada nos metadados
   privados da mensagem na mesma transação e omitida do DTO público.

Nenhuma frase produz mudança de estado, relação, recurso, consentimento,
confiança ou progresso. Estado e fontes são precondições lidas do motor; o
laboratório os prepara explicitamente em banco descartável.

## Compatibilidade e limites

Pydantic/Zod espelham os seletores opcionais estritos. Pydantic omite somente os
novos seletores ausentes/nulos ao serializar, preservando o wire legado;
seletores presentes não são corrigidos nem descartados. O schema de beats,
limites e a validação integral da 5.6.2 não foram relaxados. Planos antigos não
recebem um `dialogue: []` por default. Versão desconhecida e vínculo ambíguo
falham fechados, sem alteração de históricos.

Publicar contratos/API antes do Python que envia os novos seletores; uma API
antiga estrita pode recusá-los. Python antigo com API nova usa diálogos legados.
Desabilitar vínculos interrompe a oferta futura, sem reescrever mensagens ou
memórias. Não modificar a v1 em uso silenciosamente para fazer uma reavaliação
passar.

Permanecem no catálogo as falas genéricas e citações autorizadas anteriores.
O modelo ainda pode escolher uma delas. Não há anti-repetição entre turnos,
planejamento editorial, resumo/filtro novo de memória ou paráfrase livre.
G3/G4/G5/G6 e a Fase 5.7 permanecem fora desta entrega. A evidência offline e o
plano de avaliação real estão no [relatório](../testing/phase-5.6.3b-validation.md).

## Atualização 5.6.3B.1

O recorte original acima descreve o carregador REGULAR da B. A origem STORY_CARD
agora possui um [adaptador opt-in separado](story-card-dialogue.md), pelo manifesto
`scenePlan.storyCardDialogue`. Não há habilitação geral por card/perfil. Mantém
memória própria PUBLIC como HEARD e não fornece prova de participação para os
fragmentos pessoais. A biblioteca/textos v1 e o caminho dos regulares permanecem;
o novo vínculo é validado por instância, definição, namespace, cena e estado.
