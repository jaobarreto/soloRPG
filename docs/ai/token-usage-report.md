# Uso de tokens e contexto — Fase 5.3

Registro histórico da Fase 5.3. Para a Fase 5.4, consulte a
[avaliação atual](narrative-evaluation.md#resultado-real-e-revisão-técnica).

01/11/2026. Três tentativas externas autorizadas: uma 404 em 2.5 e duas respostas
bem-sucedidas em 3.5 Flash-Lite. As respostas reportaram 1.376 tokens de entrada,
177 de saída e 1.553 totais; latências de 2.176 e 3.427 ms. O 404 levou 1.700 ms,
sem usage (consumo desconhecido). [Evidências](live-model-validation.md).

Os prompts dos dois casos tinham 89 e 874 caracteres antes de sistema/schema.
Essas amostras mínimas não representam o contexto de campanha de 24–28 mil
caracteres medido abaixo nem permitem garantir uma sessão gratuita de duas horas.
Métricas reais do CLI foram salvas em JSON, sem escrita em ai_usage do banco real.

## Instrumentação

Cada tentativa registra provedor, modelo, entrada/saída, latência, erro sanitizado,
`inputCharacters`, `totalTokens` e `usageReported`. A etapa PROPOSE/NARRATE é
vinculada pelo NestJS, não pelo modelo. A migration aditiva `0010` preserva registros
antigos: tamanho 0, total nulo e contagem não confirmada. Zero legado não deve ser
interpretado como ausência de consumo.

`inputCharacters` mede caracteres Unicode do prompt serializado enviado ao adaptador,
incluindo a requisição contextual; não inclui a instrução de sistema separada do SDK
nem o schema. Não é uma contagem de tokens. A contagem oficial de entrada vem do SDK.
`totalTokens` preserva o total informado pelo provedor, que pode ser maior que a soma
de entrada e saída visível. Ausência de usage/timeout não comprova consumo zero.

`GET .../ai-usage` mantém a resposta em array por provedor/modelo e acrescenta turnos
com chamadas, máximo de chamadas por turno, rate limits, tamanho acumulado dos prompts,
latência média e quantidade de tentativas com usage informado. Contagens incluem
retomadas. Turnos determinísticos com zero chamadas não aparecem no agregado.
Se houver vários provedores, somar requisições entre grupos; o máximo é por grupo,
não o máximo combinado da sessão. Não é um medidor financeiro do provedor.

Teste de integração: um RATE_LIMIT sem usage + retomada bem-sucedida produzem duas
chamadas em um turno, 300 caracteres acumulados, 20 tokens de entrada, 5 de saída,
28 totais, 40 ms acumulados e 20 ms de média. Apenas uma tentativa tem contagem
confirmada; esses números não são projeção de uma sessão real.

## Economia e limites

- NARRATE publica a projeção exata sem consultar o provedor: zero chamadas externas.
- THINK/OOC e mecânica explicitamente selecionada não precisam de interpretação LLM.
- PROPOSE normal: uma tentativa; até duas com fallback explicitamente habilitado e
  ambas as contas confirmadas. Falhas permanentes não fazem fallback.
- Director e resumo factual não chamam LLM. Não há loop de correção ilimitado.
- A mensagem atual não é duplicada em `recent` no pedido de proposta.
- Regras vêm dos recursos dos presentes/opções e Stunts aplicáveis ao encontro,
  em vez dos primeiros quinze registros arbitrários do catálogo.
- Relações são restritas aos personagens recuperados. Histórico usa doze mensagens
  recentes (até 2.000 caracteres cada) e dois resumos (até 4.000 cada).
- Conhecimento crítico não é truncado para economizar tokens. Associação de NPC e
  Story Card é relacional; contexto acima de 65.000 caracteres é recusado, sem
  apagar ou compactar destrutivamente o histórico PostgreSQL.

As medidas da fixture Gloamhale são registradas na
[validação](../testing/phase-5.3-validation.md). Elas medem contexto sintético real
montado pelo backend; não tokens de uma resposta Gemini nem documentos completos.

## Estimar duas horas, depois de medir

Com T turnos observados em duas horas, C chamadas por turno e I/O tokens médios por
chamada: requisições estimadas = T × C; tokens estimados = T × C × (I + O).
Comparar também a maior janela de um minuto com RPM/TPM e o total diário com RPD/TPD
da conta, incluindo uso anterior e retomadas. Totais com tentativas sem usage são
incompletos. Não há amostra real para substituir essas variáveis nesta entrega nem
garantia de que uma sessão de 120 minutos cabe na cota. Conferir
[limites oficiais](https://ai.google.dev/gemini-api/docs/rate-limits).
