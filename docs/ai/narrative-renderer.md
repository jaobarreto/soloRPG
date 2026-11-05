# Renderer literário e publicação — Fase 5.6.2

O NestJS compõe a mensagem pública a partir de fragmentos autorizados. O modelo
escolhe e ordena beats do catálogo `rendering.publication.choices`; não pode
reescrevê-los. O contrato existente (`narrative`, `eventIds`, `beats`) permanece
inalterado nos dois runtimes. [Decisão](../adr/0011-publicacao-narrativa-por-fragmentos-autorizados.md).

## Autoridade e composição

`NarrativeContextService.rendering` recupera o contexto depois do commit: cena e
entidades públicas, interlocutor autorizado, personalidade e conhecimento próprio.
Notas privadas, GM, resumos globais e conhecimento de outros NPCs ficam excluídos.
`publicationChoices` monta:

- RESULT literal do recibo oficial, obrigatório uma vez em MECHANIC.
- ATMOSPHERE com o texto integral da cena pública ou descrição pública acessível.
  Nenhuma inferência ou nova descrição é gerada a partir de IDs de eventos.
- DIALOGUE com atribuição ao único NPC autorizado: variantes revistas de dúvida,
  cautela, acolhimento, discordância e perguntas; ou citação integral de memória própria.
- QUESTION com convites aprovados à próxima decisão, sem decidir pela protagonista.

Personalidade seleciona uma variante de voz; não autoriza copiar instruções ou
alegações do perfil. Gestos, luz, objetos e pistas só aparecem quando já descritos
nas fontes autorizadas. Estilo e ritmo se expressam pela escolha e ordem desses
fragmentos e pela qualidade do conteúdo preparado. Não há geração livre de novas
metáforas, gestos ou diálogos materiais nesse caminho. Essa redução é deliberada:
um parágrafo irrestrito não tem fundamentação demonstrável por IDs ou regex.

`validateRendering` reconstrói o catálogo na transação de publicação, sem confiar
em catálogo devolvido pelo gerador. Exige correspondência integral de `kind`,
`speakerId`, `text` e `factIds`, eventos idênticos, montagem coerente e limites de
transporte. Recusa fragmentos repetidos. Em DIALOGUE exige fala atribuída.
Retorna uma nova narração montada das strings do servidor. `NarrativeService`
persiste **essa narração**, nunca o draft apenas porque `accepted=true`.

O grafo Python continua estruturando os beats e concatenando seus textos; isso é
transporte, não autorização semântica. Pydantic e Zod continuam estritos. A regra
const→enum do schema Gemini não mudou. O prompt NARRATE de produção orienta seleção
do catálogo; nenhum prompt alternativo ou juiz externo participa da validação.

## Falas, memória e incerteza

Cada citação tem o nome do NPC e todas as linhas do relato em bloco atribuído.
WITNESSED usa “Recordo o que presenciei”; RUMOR usa “Ouvi este rumor, mas não posso
confirmá-lo”; HEARD e origens sem certeza usam “Ouvi este relato; isso não comprova
que seja verdade”. Não se aceita paráfrase que retire essa modalidade, mesmo com ID
válido. Uma memória de fala anterior continua sendo memória de alegação.

Réplicas publicadas, inclusive alternativas seguras, geram `NPC_REPLY_RECORDED` e
conhecimento HEARD na mesma transação da mensagem. Não criam culpa, descoberta,
item, dano, acordo mecânico ou delta numérico de relação. Memórias críticas da
projeção própria continuam disponíveis; o catálogo não impõe um novo top-20 global.
Fragmentos maiores que 3.000 caracteres não entram no catálogo de beats; a fonte
continua no banco. Para a resposta inteira permanece o teto de 12.000 caracteres.

## Falha, recuperação e canais

MECHANIC rejeitado publica o resultado oficial, sem transformar investigação em
CLARIFY e sem reexecutar a mecânica. DIALOGUE rejeitado usa uma réplica atribuída
segura da voz disponível. A recusa permanece em `renderingValidation` e
`deterministicFallback`; o fallback não conta como acerto semântico do modelo.
QUERY/OBSERVE/OOC continuam com informação montada pelo servidor, sem chamada
literária. THINK/CLARIFY/ADJUDICATE conservam seu caminho determinístico.

Falhas transitórias mantêm COMMITTED recuperável. Falha da mensagem reverte a
réplica e suas memórias; retry retoma somente NARRATE. HTTP de ações e SSE retornam
estado persistido, sem tokens; histórico retorna somente mensagens gravadas.
Reconectar ou repetir uma ação concluída não chama o modelo nem duplica efeitos.

## Garantia e limites

A garantia determinística é a publicação de fragmentos íntegros presentes no
catálogo reconstruído de fontes autorizadas, ou fallback do servidor. Não é uma
prova da verdade externa dos documentos de autoria, da pertinência de cada fonte,
da melhor ordem literária ou da interpretação neural da jogadora. A autoria e a
atualidade das descrições públicas continuam sendo responsabilidade da aventura.
Prosa antiga já persistida não é revisada ou apagada retroativamente.

Diálogo espontâneo continua sem precisar de opção de cena, mas sua expressão agora
é composição de variantes e memórias, não texto irrestrito. A variedade é limitada;
novas variantes exigem autoria/revisão e testes. Avaliação real dessa seleção requer
nova autorização própria. [Evidência offline e matriz](../testing/phase-5.6.2-validation.md).
