# KHAOS — Seleção semântica da Una após a C.1

## Diagnóstico

O recibo da rodada `44d1efc1-faef-4944-89f7-18d3ad689d20` conserva a descrição
“Pede para Iria explicar seu ponto sem presumir um acordo.” A descrição, o
interlocutor e o assunto estavam corretos. Na mesma proposta, `expression=DIRECT`
e `disagreement/CLARIFY` divergiram do gabarito `QUESTION` e
`disagreement/ANSWER`. CLARIFY constava em conversation, mas não em disagreement
para Iria. Duas réplicas ANSWER estavam disponíveis. O NestJS retornou
`UNAUTHORIZED_DIALOGUE_SELECTION`; não houve NARRATE nem efeito.

O catálogo em `dialogue-content.ts` define as réplicas e suas precondições.
A projeção `planner_request` em `selection.py` envia ao PROPOSE o menu por nome,
com pares inteiros de assunto/ato, sem textos de réplicas ou fontes privadas de
diálogo. O grafo em `graph.py` usa essa projeção e o adaptador Gemini envia
`MASTER`. As instruções antigas exigiam escolhas exatas, mas não diziam de
quem era o ato de resposta nem distinguiam a réplica CLARIFY da ferramenta
CLARIFY. A definição de QUESTION já abrangia pedidos indiretos; os exemplos
de consulta destacavam QUERY/MEMORY e faltava o contraste no diálogo com NPC.

Pydantic e Zod verificam estrutura e vocabulário. O schema global aceita
CLARIFY como ato e não representa a disponibilidade dinâmica de um par.
O interpretador NestJS em `free-action.ts` resolve a identidade e valida o par
completo no menu atual do NPC pelo ID. Portanto, validade estrutural,
autorização contextual e acerto semântico são três resultados distintos.
A diferença de camadas é intencional e a ambiguidade observada estava na
orientação semântica do prompt, sem divergência estrutural entre contratos.
Que o modelo tenha confundido “explicar” com CLARIFY, ou tratado a forma
cortês como comando, são hipóteses; o recibo não revela por que escolheu os
rótulos.

## Correção

Somente `apps/ai-service/app/narrative/prompts.py` mudou em produção. MASTER
explicita três decisões separadas: a forma comunicativa da jogadora, sua
intenção, e a função da réplica pretendida do NPC. QUESTION abrange pedidos
de explicação em diálogo; pontuação sozinha não define a expressão. ANSWER
responde ao ponto identificado; o ato CLARIFY pede que a jogadora especifique
o ponto; DISAGREE expressa discordância do NPC. A ferramenta CLARIFY continua
disponível quando a interpretação depende de uma referência faltante. Se o
pedido for compreensível mas faltar uma réplica pertinente autorizada, o
prompt orienta o caminho legado, sem seletores. Um par selecionado deve vir
inteiro de uma escolha vigente do interlocutor resolvido.

Não há substituição de valores, parser por palavras, enum dinâmico nem mudança
nos contratos ou na política de autorização. NARRATOR, catálogo G1/G2,
Story Cards, fontes, autoria, agência, regras e fronteira 5.6.2 continuam
intactos. O diálogo legado continua sujeito à autorização de publicação
existente.

## Evidências offline

- `test_dialogue_selection_prompt.py`: sete fixtures passam pelo grafo e
  adaptador Gemini com o SDK substituído, sem rede. Exercitam pergunta,
  explicação indireta, discordância, pedido de esclarecimento cujo referente
  não está determinado, ambiguidade de alvo, ausência de réplica e par inválido
  deliberado. Conferem prompt efetivo, menus de NPCs distintos, remoção de
  conteúdo fora do menu e preservação da proposta simulada sem correção.
  Antes da edição de MASTER, a primeira fixture falhou na instrução ausente;
  depois, as sete passaram. As saídas são fixtures, não previsões do modelo.
- `free-action.spec.ts`: autorização por NPC e por par, inclusive recusa de
  par incompleto, cruzado, pertencente a outro NPC ou revogado. Verifica
  preservação do caminho legado e ausência de comando de jogo.
- **254 testes Python**, **119 testes Jest em cinco suítes** e **7 arquivos
  de testes dos contratos compartilhados** aprovados. A suíte Jest inclui
  paridade Pydantic/Zod, fontes próprias e Story Cards, publicação por texto
  integral, referências e speakerId, e rejeição da galeria inventada.
  Ruff passou nos dois arquivos Python tocados e Prettier formatou apenas
  o teste NestJS editado.
- A primeira execução Jest no sandbox expirou ao aguardar o subprocesso
  Python; passou fora dessa restrição de IPC. A execução Python com asyncio
  também precisou da sinalização local entre threads. As regressões
  reexecutadas usam fixtures e provedores simulados; zero chamadas externas,
  nenhum banco ou campanha.
- SHA-256 do plano C.1, manifesto histórico e arquivos de recibo da rodada
  conferidos antes/depois. A verificação offline do executor agora retorna
  `FROZEN_FILE_DRIFT` para o manifesto histórico: ele vincula o prompt
  anterior e deve continuar rejeitando a combinação. Nenhum hash congelado
  foi regenerado.

Comandos executados (Python a partir de `apps/ai-service`; demais na raiz):

```sh
LANGSMITH_TRACING=false LANGCHAIN_TRACING_V2=false .venv/bin/python -m pytest -q tests/test_dialogue_selection_prompt.py tests/test_phase5611.py tests/test_gemini_schema.py tests/test_phase56.py tests/test_phase562.py tests/test_contextual_dialogue.py tests/test_story_dialogue_bridge.py
.tools/node_modules/.bin/pnpm --filter @solo-rpg/api test --runTestsByPath test/free-action.spec.ts test/dialogue-content.spec.ts test/story-card-dialogue.spec.ts test/phase562-publication.spec.ts test/literary-evaluation.spec.ts
.tools/node_modules/.bin/pnpm --filter @solo-rpg/shared-contracts test
```

## Limites e próxima validação

As instruções podem melhorar a seleção, mas o Gemini ainda pode devolver um
par válido e pouco pertinente, escolher a forma errada ou omitir uma seleção
adequada. O NestJS comprova autorização, não pertinência literária. A
intervenção também não corrige a prosa técnica opcional nem mede variedade,
voz ou continuidade.

Para confirmação real, revisar e aprovar um manifesto novo em artefato separado,
vinculado ao prompt atual, mantendo congelados os insumos e critérios
históricos. Solicitar autorização explícita e separada para o modelo e o
orçamento dessa rodada. Começar por PROPOSE: exigir em C1-2 o JSON original
com `QUESTION` e `disagreement/ANSWER`, alvo original, sem novos fatos ou
efeitos, e comparar com C1-1 e controles de explicação indireta, ambiguidade,
atos realmente oferecidos e ausência de réplica pertinente. Fixar esses
controles e seus critérios antes de chamar o modelo. Registrar resposta bruta,
validação estrutural, seleção semântica e decisão NestJS separadamente, sem
reparos, retries ou fallback; interromper na primeira falha semântica ou
crítica. Uma eventual avaliação de NARRATE requer escopo explícito e análise
separada de publicação e qualidade literária. Nenhum novo experimento foi
iniciado.
