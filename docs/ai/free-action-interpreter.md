# Interpretador de ações livres

Atualização 5.6: [política contextual e fundamentação](phase-5.6-selection.md),
[ADR 0010](../adr/0010-selecao-contextual-e-respostas-fundamentadas.md).
`expression` e `evidence` são aditivos; geração nova exige ambos. QUERY tem intenção
própria e resolução distinta de OBSERVE. Fontes e capacidades atuais, incluindo
vínculo opcional de alvo na preparação local, determinam o que pode ser autorizado.
Não há classificação determinística de frases por palavras-chave.

Atualização 5.6.1.1: `expression` descreve o ato comunicativo da mensagem completa,
independentemente de `intent`, `tool`, modo do chat ou descrição operacional. Uma
pergunta de memória em ACT continua QUESTION; um comando explícito de consulta pode
ser QUERY/DIRECT. Pedidos indiretos de informação também são QUESTION. Não há
normalização da resposta para corrigir expressão errada.

O schema genérico ARCANA conserva seus campos para transporte e histórico. Antes
de construir um comando, NestJS recusa valores não nulos incompatíveis com o arcano
com CLARIFY/`ARCANA_PARAMETER_MISMATCH`, auditado em `freeResolution.selectionReason`.
Escudo admite somente raised; Segunda Visão e Curar não admitem esses parâmetros;
Contato admite tradition; Controle Corporal, tradition/use; Mover Objeto, fatigue;
Moldar Vento, category. Null/omissão representam ausência de escolha, conforme a
compatibilidade existente. Campos necessários omitidos e tradições incompatíveis
continuam sujeitos aos validadores anteriores. A ficha demonstra capacidade,
não autoriza o LLM a completar uma escolha da jogadora.

[Validação offline e limites da correção](../testing/phase-5.6.1.1-validation.md).

O contrato compartilhado está em `packages/shared-contracts/src/free-action.ts`, espelhado por modelos Pydantic estritos. PROPOSE combina compreensão, planejamento e ferramenta. Quando `freeActions` está ativo e não há opção explícita, o modelo recebe somente `FreeAction`; contratos legados continuam disponíveis apenas no caminho de escolhas explícitas. Não usa um catálogo de frases para classificar português. A taxonomia descreve intenções, incluindo `OTHER`; ela não limita o vocabulário da mensagem.

```json
{
  "kind": "FREE",
  "intent": "TALK",
  "description": "Perguntar a Mira se confia em Aren",
  "target": { "type": "CHARACTER", "name": "Mira" },
  "tool": { "type": "DIALOGUE" }
}
```

`target` também admite `WORLD`/`ITEM`, ou `null`. Não admite IDs persistentes. O NestJS normaliza acentos/caixa e exige um único alvo autorizado; não escolhe entre homônimos. Descrição e perguntas propostas são dados de planejamento, sem autoridade sobre estado ou texto público.

Intenções: conversar, investigar, observar, explorar, deslocar, usar arcano, atacar, defender, interagir, usar item, ajudar, descansar, esperar, agir socialmente, recusar, negociar, mentir, OOC, corrigir, pensar e outras. `free-action.ts` restringe combinações incompatíveis: chamar algo de OBSERVE não autoriza uma cura ou um ataque. THINK é privado, OOC/correção não executam ferramentas mecânicas, e mecânicas voluntárias exigem modo ACT.

Exemplos de limites: “minha magia nele” pede arcano/alvo; Escudo exige erguer/baixar; Controle Corporal exige efeito/tradição/alvo; repouso leve exige sustento. Nenhum parâmetro mecânico omitido é escolhido para completar a frase. `WAIT` exige duração numérica explícita em minutos e relógio de aventura existente. A interpretação semântica do LLM ainda pode errar; os testes reais devem medir isso, inclusive negação e instruções adversariais.

Uma investigação livre pode consultar o que já está público. Para descobrir algo por teste, `PREPARED_CHECK` referencia pelo nome uma capacidade autorizada, cuja dificuldade e consequências vêm do plano servidor. Sem política, a tentativa não ganha sucesso inventado. Mover-se para local arbitrário, ajudar com efeitos ou usar item sem política continuam sob adjudicação. Isso é uma limitação de automação, não uma proibição narrativa da escolha.

A proposta validada é privada em `narrative_actions`; a mensagem original permanece integral no chat. O backend guarda autorização resolvida em metadados internos, filtrados pela projeção pública. Retomar uma rolagem usa essa resolução persistida, sem interpretar de novo nem executar efeitos duas vezes.

## Fase 5.5 — referências explícitas

FREE pode receber menções selecionadas e revalidadas pelo NestJS. O alvo nominal devolvido pelo modelo só pode usar a identidade selecionada pertinente; homônimos sem seleção continuam pedindo esclarecimento. Ausência, indisponibilidade e regras continuam sendo verificadas. O catálogo é público e independente do LLM. [Contrato e composer](contextual-mentions.md).
