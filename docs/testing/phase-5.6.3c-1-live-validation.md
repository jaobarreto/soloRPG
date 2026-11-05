# KHAOS — 5.6.3C.1: primeira rodada real da Una

02/11/2026. **Rodada encerrada após 3 requisições reais, na primeira divergência
semântica.** C1-1 concluído; C1-2 interrompido em PROPOSE; C1-3–6 não executados.
Não se reutilizarão as nove requisições restantes. Nenhuma correção implementada.

## A. Autorização e identificação

O operador autorizou expressamente uma única rodada, confirmou chave ativa de
projeto gratuito e faturamento desativado e aceitou o executor/plano congelados.
Limites: Gemini gemini-3.5-flash-lite; até 12 chamadas, 6 PROPOSE/700 e
6 NARRATE/1.200, teto configurado de saída 11.400; zero retries, fallback ou reparos;
nenhuma escrita em campanha/banco real; interrupção na primeira falha semântica
ou crítica, sem continuação de casos independentes.

RoundId: `44d1efc1-faef-4944-89f7-18d3ad689d20`.
Início registrado: 02/11/2026 21:56:58 UTC (18:56:58 em São Paulo).
[Registro da autorização](../ai/phase-5.6.3c-1-live-runs/44d1efc1-faef-4944-89f7-18d3ad689d20-authorization.json).

## B. Conferências obrigatórias e execução

Foi utilizado exclusivamente o CLI existente de literary_executor.py, uma única
vez em modo real. Não se repetiram desenvolvimento, suíte de testes, dry-run ou
preflight completo. As verificações obrigatórias do próprio executor passaram:
integridade, seis casos, schemas de entrada e replay determinístico prévio.

- Manifesto aprovado e utilizado:
  `dcb2c1cf29f3189b85beec429709e9f6174d0c9e9da62e635bbbd47be9114768`.
- Plano utilizado:
  `04c31b43e50bd39573e75529590f5c33128d806e426930858263b40a8b93d712`.
- Provedor/modelo, fallback desativado e vínculo da chave à confirmação do operador
  conferidos. Confirmação financeira somente na cópia de Settings do processo.
- O tier financeiro foi atestado pelo operador, não auditado por API financeira.

O executor reservou três slots, registrou cada retorno e terminou com exit code 1,
status INTERRUPTED e motivo SEMANTIC_FAILURE_OPERATOR_REVIEW_REQUIRED. Esse exit
code representa a parada exigida pelo experimento, não erro de autenticação ou
contrato. O trabalho foi individual; não houve parecer novo de subagente QA.

## C. Casos concluídos, interrompidos e não executados

| Caso | Situação | Resultado |
| --- | --- | --- |
| C1-1 / Iria | Discordância anterior | PROPOSE correto; NARRATE e publicação autorizados |
| C1-2 / Iria | Explicar posição sem presumir acordo | PROPOSE estruturalmente válido, semanticamente divergente; NARRATE não chamada |
| C1-3 / Iria | Discordância sem pedido de perdão | Não executado após parada |
| C1-4 / Lior | Promessa ouvida | Não executado após parada |
| C1-5 / Lior | Recuperar fala anterior | Não executado após parada |
| C1-6 / Tessa | Comparação de voz com Iria | Não executado após parada |

Os contextos são os requests originais do [plano congelado](../ai/phase-5.6.3c-1-live-plan.json).
Uma cópia derivada dos três requests efetivamente utilizados, com mensagens,
expectativas e referências aos recibos, consta de analysis.json da rodada.
As expectativas são dados do avaliador; não foram anexadas aos prompts.

## D. Respostas brutas e resultados estruturais

[Recibo integral original](../ai/phase-5.6.3c-1-live-runs/44d1efc1-faef-4944-89f7-18d3ad689d20/result.json) e
[journal append-only](../ai/phase-5.6.3c-1-live-runs/44d1efc1-faef-4944-89f7-18d3ad689d20/events.jsonl).
rawText contém o JSON SDK antes do parsing/montagem; seus hashes foram conferidos.
Os três retornos passaram Pydantic e Zod; o modelo reportado foi exatamente
gemini-3.5-flash-lite nas três tentativas. Nenhum erro de provedor foi registrado.

C1-1 PROPOSE, mensagem: **“Você ainda discorda de mim sobre continuarmos a viagem?”**

```json
{
  "kind": "FREE",
  "intent": "TALK",
  "description": "Pergunto a Iria se ela ainda discorda de mim sobre continuarmos a viagem.",
  "target": {"type": "CHARACTER", "name": "Iria"},
  "expression": "QUESTION",
  "evidence": [],
  "tool": {"type": "DIALOGUE", "topic": "disagreement", "act": "ANSWER"}
}
```

C1-1 NARRATE selecionou RESULT + DIALOGUE. Texto integral autorizado:

> Iria ouviu sua fala e pode responder. Nenhuma confiança, acordo ou informação foi confirmada apenas pela tentativa.
>
> Iria — Não considero aquele desacordo resolvido. Prefiro esclarecer o que ficou entre nós antes de chamar isso de acordo.

A validação do original e a do resultado do grafo aceitaram esse texto.
graphChangedNarrative=false, fallbackUsed=false. A publicação é **virtual**, pelo
replay NestJS, sem mensagem/evento/memória gravados em campanha. Não se apresenta
essa saída como chat persistido. Nenhum texto livre adicional foi aceito.

C1-2 PROPOSE, mensagem: **“Pode explicar seu ponto sem presumir um acordo?”**

```json
{
  "kind": "FREE",
  "intent": "TALK",
  "description": "Pede para Iria explicar seu ponto sem presumir um acordo.",
  "target": {"type": "CHARACTER", "name": "Iria"},
  "expression": "DIRECT",
  "evidence": [],
  "tool": {"type": "DIALOGUE", "topic": "disagreement", "act": "CLARIFY"}
}
```

## E. Seleção semântica

C1-1 corresponde ao gabarito em kind, intenção, alvo, expressão, evidências e
ferramenta/assunto/ato. A descrição também preserva o pedido na leitura qualitativa
do agente. NARRATE escolheu uma das duas réplicas preparadas, com speakerId e
factIds exatos. Isso comprova essa seleção, não qualidade literária plena.

| C1-2 | Esperado congelado | Observado original |
| --- | --- | --- |
| kind / intent / alvo | FREE / TALK / Iria | Corretos |
| expression | QUESTION | **DIRECT** |
| ferramenta / assunto | DIALOGUE / disagreement | Corretos |
| act | ANSWER | **CLARIFY** |

A descrição captou o pedido de explicação, mas as duas classificações acima
divergiram. O gabarito não foi reinterpretado para aceitar DIRECT ou CLARIFY.
O menu de disagreement tinha ANSWER, RESUME, DISAGREE e REFUSE; CLARIFY estava
disponível apenas em conversation. Assim, além da expressão errada, o modelo
selecionou um par assunto/ato que não estava autorizado para aquela conversa.

O NestJS recusou o par, retornando categoria CLARIFY e reason
UNAUTHORIZED_DIALOGUE_SELECTION, sem efeito. Texto determinístico da resolução:

> Não há uma resposta autorizada para esse assunto e interlocutor. Pode esclarecer o que deseja conversar?

Esse texto é a resolução do backend, **não uma NARRATE do Gemini nem uma mensagem
persistida**. Há falha semântica do modelo e bloqueio seguro do backend. Não houve
fallback de provedor/renderização; fallbackUsed=false não apaga a recusa.

Havia duas respostas ANSWER elegíveis no contexto NARRATE congelado de C1-2.
Portanto, a parada não comprova ausência de resposta no catálogo: decorre da
seleção incorreta. É hipótese, não causa demonstrada, que o modelo tenha confundido
o pedido de explicação com o rótulo CLARIFY.

## F. Avaliação literária qualitativa

Revisão técnica/editorial do agente, sem notas humanas e sem aprovação humana:

| Dimensão C.0 | Evidência e limite |
| --- | --- |
| Naturalidade | O preâmbulo “Nenhuma confiança, acordo ou informação...” soa como explicação do sistema. A fala posterior é mais conversacional, ainda expositiva |
| Personalidade | A preferência por esclarecer antes de concordar é compatível com Iria reservada. Uma única réplica compartilhada pelo perfil não demonstra identidade individual; Tessa não foi avaliada |
| Contextualização | A réplica responde que o desacordo continua aberto. Não acrescenta razões específicas sobre a viagem; o fragmento é geral |
| Continuidade | Usa corretamente a fonte própria do desacordo não resolvido. Não houve evolução dinâmica ou persistência entre turnos |
| Variedade | Uma única NARRATE: insuficiente para avaliar repetição entre respostas. Contagem de adjacentes zero aqui é trivial, não evidência positiva |
| Qualidade literária | Texto claro e funcional, com abertura técnica que reduz imersão. Não sustenta, sozinho, experiência de romance interativo |
| Ritmo | Dois blocos, sem atmosfera repetida ou pergunta final automática. O RESULT opcional repete informação operacional antes da resposta do NPC |
| Agência | Não foi inventada decisão, emoção ou fala voluntária da protagonista na saída autorizada examinada |
| Fidelidade ao cânone | Mantém o desacordo; não afirma reconciliação, ajuda ou descoberta nova. Afirmações correspondem às projeções autorizadas |
| Segurança narrativa | Identidade e referência próprias conferem no único NARRATE. Sigilo/HEARD de Story Cards não foram avaliados pelo modelo nesta rodada |

A inclusão do RESULT foi escolha real do Gemini entre opções autorizadas; o
conteúdo técnico desse RESULT veio do servidor, não de prosa livre do modelo.
O DIALOGUE também veio da G1/G2. Isso separa composição pelo modelo de limitações
editoriais do repertório. Nenhum escore foi inferido de aceitação estrutural.
A ficha human-review.json permanece intocada, com todas as notas pendentes.

## G. Segurança narrativa

Iria utilizou speakerId `68feff2c-cfa3-47eb-a425-b99d3dd11dbc` e factId
`53f31b33-2b66-4478-ace5-f8c3b965fb2b`. A fonte própria WITNESSED era:

> Iria e a protagonista discordaram sobre continuar a viagem; o desacordo não foi resolvido.

O texto e as referências foram aceitos pela fronteira 5.6.2 sem normalização da
narrativa. C1-2 foi bloqueado antes de NARRATE. Não se observou violação de agência,
fonte alheia, segredo ou consequência extra nos resultados examinados. Isso não
certifica todos os cenários ou segredos possíveis. Não houve escrita em banco ou
campanha real, nem avaliação nova de persistência, idempotência ou ciclo de sessão.

## H. Consumo reportado e latência

| Tentativa | Entrada | Saída | Total | Latência SDK |
| --- | ---: | ---: | ---: | ---: |
| C1-1 PROPOSE | 2.725 | 120 | 2.845 | 1.844 ms |
| C1-1 NARRATE | 2.032 | 273 | 2.305 | 2.030 ms |
| C1-2 PROPOSE | 2.723 | 117 | 2.840 | 2.544 ms |
| **Soma** | **7.480** | **510** | **7.990** | **6.418 ms** |

Todos os três registros têm usageReported=true. Os totais são os retornados pelo
SDK; não são estimativa de custo. A soma das latências SDK não é a duração total
do processo, que também inclui verificações e replay local.

Reservas: 2 PROPOSE + 1 NARRATE; teto configurado reservado 2.600 tokens de saída.
Isso é diferente dos 510 tokens de saída efetivamente reportados e dos 7.990
tokens totais. O teto autorizado era 11.400 de saída. Não houve retry, fallback,
reparo, troca de modelo ou chamada adicional após a interrupção.

## I. Comparação histórica

- A: 58 turnos com seletores roteirizados e grafo de produção; evidenciou eco de
  memória, atmosfera/fechos e genericidade. Não são respostas reais Gemini.
- B: 58 pedidos comparáveis, G1/G2 e seletores roteirizados; ofereceu réplicas de
  conflito melhores, ainda formulaicas. Não isolou efeito de modelo.
- B.1: exemplos simulados persistidos de Story Cards com memória HEARD. Não há
  comparação real nova com Lior porque C1-4/5 não foram executados.
- C.0: 100 saídas autorizadas em memória; duas variantes em 12 turnos não deram
  desenvolvimento real. O diagnóstico de linguagem de auditoria reaparece aqui,
  mas a amostra de uma narração não permite medir repetição prolongada.

A fala de desacordo selecionada agora também existe nos exemplos simulados B:
igualdade decorre da mesma biblioteca, não de criatividade independente do Gemini.
A novidade real é a seleção C1-1 correta e a divergência categórica C1-2, com
interrupção automática. Não se afirma ganho estatístico/literário entre corpora.

## J. Falhas e limitações

1. **Interpretação/seleção:** C1-2 falhou em expression e tool.act. Estrutura válida
   não equivale a seleção correta. A atuação segura do backend não a transforma
   em aprovação.
2. **Conteúdo:** o RESULT operacional é artificial para a experiência literária;
   a fala de perfil é abstrata. Não há evidência de que esses textos foram
   inventados pelo modelo. No pedido C1-2 havia ANSWER disponível.
3. **Composição:** o Gemini optou por um preâmbulo dispensável. Essa escolha é
   autorizada hoje; não é defeito estrutural de publicação.
4. **Qualidade:** voz individual, comparação de personagens, conversa longa,
   repetição, Lior/HEARD e continuidade entre sessões continuam não medidos.
5. **Escopo:** projeções sintéticas congeladas, sem histórico adaptativo e sem
   teste de todas as regras Blue Rose ou de campanha completa.

Não foram repetidos testes ou corrigidos arquivos. A pendência histórica de
formatação global não foi tratada nem reavaliada como parte desta rodada real.

## K. Recomendações, em ordem de prioridade

1. Revisar humanamente C1-2 contra o contrato e o menu congelados, preservando a
   reprovação. Investigar a distinção QUESTION/DIRECT e o par disagreement/ANSWER
   em uma futura intervenção autorizada; não mapear CLARIFY para ANSWER para obter acerto.
2. Examinar a escolha de pares efetivamente disponíveis no PROPOSE, com contrastes
   offline futuros. Não adicionar um parser por palavras nem ajustar o gabarito.
3. Avaliar editorialmente o RESULT operacional opcional no diálogo, separando a
   redação do servidor da decisão do modelo de incluí-lo. Qualquer mudança exige
   escopo/revisão próprios e preservação integral da 5.6.2.
4. Manter o diagnóstico de repertório/voz C.0 como hipótese de melhoria por conteúdo
   revisado; esta amostra não autoriza declarar dois NPCs indistinguíveis.
5. Só planejar nova medição real após análise do operador e nova autorização.
   Não executar C1-3–6 nem reutilizar slots restantes desta rodada automaticamente.

Não se implementou nenhuma dessas recomendações, nem G3/G4/G5/G6, 5.7 ou 5.8.

## L. Decisão e encerramento

**REPROVADA no critério de seleção semântica exigido para a rodada**, pela
divergência C1-2. C1-1 passou na seleção e publicação do recorte observado;
operação de orçamento/parada e fronteira de publicação funcionaram nas tentativas
efetivas. A avaliação literária é limitada e permanece sem notas humanas.

Esta é a conclusão técnica do agente trabalhando individualmente, não aprovação
de QA independente nem parecer humano. Não demonstra autonomia completa da Una,
identidade de todos os NPCs ou prontidão integral de Gloamhale. A rodada está
encerrada; o próximo escopo depende da avaliação do operador.
