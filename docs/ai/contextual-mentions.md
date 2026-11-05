# Menções contextuais — Fase 5.5

`@` seleciona personagens; `#` seleciona itens ou objetos interativos. Texto livre continua funcionando sem seleção. Uma menção só identifica a entidade; não determina presença, consentimento, acesso, regra ou sucesso. [Decisão arquitetural](../adr/0009-mencoes-como-referencias-autorizadas.md).

## Catálogo público

`GET /api/v1/campaigns/:campaignId/sessions/:sessionId/mentions?symbol=%40&q=Ei` ou `symbol=%23&q=Lam` retorna `{data,hasMore}` com no máximo 20 entradas. Cada entrada tem `type` (CHARACTER/ITEM/WORLD), `entityId`, `label`, `availability` e `context` público. Personagens presentes precedem conhecidos ausentes; itens do inventário precedem objetos autorizados. Filtros ignoram caixa e acentos e aceitam espaços. Digitar mais restringe uma lista limitada; hasMore não revela contagem secreta. Sessões LOCKED retornam lista vazia.

Personagens relacionais precisam ser known; Story Cards precisam ter sido revelados e representar INDIVIDUAL. Archetypes não são identidades pessoais. Inventário é o da protagonista, com quantidade positiva e visibilidade permitida. Objetos precisam de kind OBJECT, accessible=true e visibilidade pública/da jogadora. O schema atual não possui vínculo objeto→sala; accessible é a preparação/autorização local, e não se converte o campo textual objects das salas em objetos utilizáveis. Nenhum item comum é excluído por não ser “importante”. Itens de outros personagens não são utilizáveis só por serem conhecidos.

## Entrada e revalidação

POST actions mantém actionId, interactionMode e content e acrescenta mentions opcional. Exemplo com índices UTF-16:

```json
{
  "actionId": "00000000-0000-4000-a000-000000000001",
  "interactionMode": "ACT",
  "content": "🙂 #Lampião Azul",
  "mentions": [
    {
      "type": "ITEM",
      "entityId": "00000000-0000-4000-a000-000000000002",
      "label": "Lampião Azul",
      "literal": "#Lampião Azul",
      "start": 3,
      "end": 16
    }
  ]
}
```

UUIDs do exemplo são ilustrativos: somente IDs autorizados naquele save são aceitos. start inclusivo e end exclusivo usam unidades UTF-16, como textarea.selectionStart e String.slice; o emoji ocupa duas. O servidor preserva o texto original sem trim e recusa mensagens em branco, intervalos incorretos, sobreposição, limites de palavra inválidos e divergência entre símbolo/tipo/label/literal. Uma entidade pode aparecer novamente em outro trecho, mas não há duas associações para o mesmo trecho. Limite: 30 referências por mensagem.

NestJS revalida catálogo e spans sob os locks antes de persistir, antes de PROPOSE/retry e novamente antes da resolução. O hash da ação inclui as referências. Pydantic valida o espelho do conteúdo enviado no contexto Python, incluindo intervalos UTF-16. Não existem IDs novos escolhidos pelo modelo: FREE continua retornando nomes, e o servidor mantém o ID selecionado. Um nome divergente é esclarecido; dois homônimos selecionados como possíveis alvos continuam exigindo desambiguação. Um conhecido ausente não aparece nos atores executáveis.

As referências persistem em session_messages.metadata.mentions para recuperação. Contexto privado, tabela de fatos e condições do Director não acompanham esse catálogo. NARRATE mantém sua projeção pública limitada. SSE só reproduz o recibo público persistido. Menções não podem se combinar com optionId/mechanic no mesmo payload: selecione a tentativa preparada ou escreva uma ação FREE. Escolher uma referência limpa as seleções de capacidade na UI.

## Composer e limites

O textarea existente oferece lista filtrada, ↑/↓, Enter, clique e Escape. Após escolher, insere o nome legível e devolve foco/cursor. Acentos, espaços e múltiplas menções são mantidos; editar dentro do token remove sua associação, editar antes desloca intervalos, apagar remove a referência. Texto normal e @/# sem seleção continuam texto livre. Sem resultado ou serviço indisponível, a jogadora pode continuar digitando. Requisições obsoletas de autocomplete são descartadas.

A interface não implementa rich text, fichas flutuantes ou comandos administrativos. Uso genérico de item, comunicação remota e lotes arbitrários de efeitos permanecem fora das capacidades existentes. Pedidos sem regra vão para esclarecimento/adjudicação; não recebem efeitos por haver uma menção. A avaliação usa IA simulada, sem alegar qualidade semântica do Gemini. [Evidência e limites](../testing/phase-5.5-validation.md).
