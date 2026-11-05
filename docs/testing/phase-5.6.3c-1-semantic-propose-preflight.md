# KHAOS — Confirmação real de PROPOSE: preparação

Rodada proposta: `9247f347-74c4-40d5-972f-63c5f836fa6a`.
Estado: aguardando autorização específica; nenhuma chamada real.

- Plano: `docs/ai/phase-5.6.3c-1-semantic-propose-plan.json`
  (SHA-256 `f9ea23c665cbec9a89910ca51e0fb0b6aaacd4fb06b74418c2430099e119a804`).
- Manifesto: `docs/ai/phase-5.6.3c-1-semantic-propose-manifest.json`
  (SHA-256 `c257cdbead041f4a997f05ba33c39a2d1289b1188e99c0b981f34c3b6c9273cb`).
- O manifesto vincula o MASTER atualizado, o código de produção relevante,
  o runner e o replay novos, o plano novo e as evidências históricas.
  Na comparação com os hashes de produção e avaliação históricos, a única
  divergência foi o MASTER já corrigido. Nenhum hash histórico foi regravado.

| Caso | Mensagem | Seleção exigida | Replay esperado |
| --- | --- | --- | --- |
| C1-2 | Pode explicar seu ponto sem presumir um acordo? | TALK, QUESTION, Iria, DIALOGUE disagreement/ANSWER | DIALOGUE para Iria |
| SP-2 | Iria, gostaria de entender por que você discorda de continuarmos a viagem. | TALK, QUESTION, Iria, DIALOGUE disagreement/ANSWER | DIALOGUE para Iria |
| SP-3 | Pode me explicar o que quis dizer? | QUESTION, TALK ou OTHER, ferramenta CLARIFY, sem alvo | CLARIFY / CLARIFICATION_REQUIRED |
| SP-4 | Lior, pode repetir exatamente o que ouviu sobre a promessa de ajuda? | TALK, QUESTION, Lior, DIALOGUE promise/RESUME | DIALOGUE para Lior, origem STORY_CARD |

Todos exigem FREE, evidência vazia, JSON aceito por Pydantic e Zod e nenhuma
autorização de efeito. A requisição integral e o gabarito de C1-2 são iguais
aos históricos. SP-3 tem dois NPCs disponíveis e nenhuma referência que
resolva de quem ou de que fala se trata. SP-4 pede reprodução de fala ouvida,
sem inferir cumprimento da promessa. Descrição e texto de esclarecimento
têm critérios de sentido para revisão humana posterior; não são comparados
por palavras. Nenhuma expectativa entra nos dados enviados ao modelo.

O executor antigo fixa seis casos e duas etapas. O novo ponto de entrada
`app.evaluation.semantic_propose_executor` reutiliza a autorização financeira
e reserva auditável da C.1, a captura no SDK, LangGraph, MASTER, adaptador
e roteador de produção. O replay separado chama Zod e a política NestJS
pura sobre o JSON original e o contexto congelado, sem subir a aplicação.
Uma resposta inválida que o grafo converta em esclarecimento seguro continua
reprovada. Um bloqueio NestJS não conta como acerto, salvo a resolução de
esclarecimento expressamente esperada em SP-3. O arquivo de eventos registra
a reserva e a resposta original antes da avaliação; por segurança, conteúdo
detectado como privado ou financeiro é retido apenas como hash e motivo.
Resultado registra campos divergentes, resolução, modelo, tokens reportados,
latência, falhas e casos não tentados. Tokens ausentes ficam desconhecidos.

Limites: Gemini `gemini-3.5-flash-lite`, quatro slots únicos e ordenados de
PROPOSE, 700 tokens de saída por slot (2.800 de teto configurado de saída,
sem contar entrada ou consumo adicional), 65.000 caracteres de entrada
por chamada no limite do roteador. Zero NARRATE, retry, fallback ou reparo;
zero efeitos e escritas em campanhas/banco. Parada automática na primeira
falha categórica, recusa inesperada ou falha crítica. Sem reaproveitamento
dos slots restantes. Apenas a revisão posterior avalia nuances da descrição
e do pedido de esclarecimento. Nenhum resultado é publicado.

A confirmação financeira é uma declaração do operador sobre a chave ativa;
preflight local não consulta o projeto, faturamento ou disponibilidade remota.
A proteção financeira normal está desativada para chamadas (a flag de
confirmação permanece falsa), e qualquer liberação é cópia só para o
processo autorizado. A entrada live exige a identificação da rodada, o hash
aprovado, declaração explícita de projeto gratuito e faturamento desligado,
rótulo do projeto e vínculo local da chave. A trava exclusiva impede reutilizar
a mesma rodada e os recibos têm diretório próprio.

Este experimento permite comparar o resultado bruto de C1-2 com a tentativa
histórica e sondar três controles. Quatro amostras, três delas sem comparação
histórica equivalente, não isolam causalidade nem medem taxa de acerto geral.
NARRATE, qualidade literária e memória dinâmica ficam fora do escopo.

## Verificações realizadas

- Preflight local: `PREFLIGHT_ONLY`, quatro gabaritos aceitos por Pydantic,
  Zod e replay NestJS nas resoluções previstas. Configuração local: modelo
  correto, credencial presente, fallback desligado e flag financeira normal
  falsa. Nenhuma credencial ou impressão digital foi exibida.
- Sete testes offline passaram. O HTTP em memória fez quatro invocações
  simuladas no percurso completo e uma nos testes de parada por divergência
  semântica, JSON inválido, modelo inesperado, HTTP 429 ou faturamento.
  A regressão de C1-2 conserva o JSON com DIRECT/CLARIFY, registra a recusa
  NestJS e impede o próximo slot. Os testes conferem ausência de gabaritos no
  payload, proteção contra repetição, bloqueio sem autorização financeira,
  hash incorreto e impossibilidade de NARRATE ou de um quinto slot.
- Ruff e Prettier passaram para os arquivos novos. Plano, manifesto e recibos
  históricos foram conferidos por SHA-256. A rodada nova não foi reivindicada.
  Zero chamadas reais e zero escritas em banco ou campanha.

A partir de `apps/ai-service`, comandos de verificação:

```sh
.venv/bin/python -m app.evaluation.semantic_propose_executor --manifest-sha256 c257cdbead041f4a997f05ba33c39a2d1289b1188e99c0b981f34c3b6c9273cb
LANGSMITH_TRACING=false LANGCHAIN_TRACING_V2=false LANGCHAIN_TRACING=false .venv/bin/python -m pytest -q tests/test_semantic_propose_executor.py
```
