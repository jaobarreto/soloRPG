# Validação real controlada — Fase 5.3

Registro histórico da Fase 5.3. Para a Fase 5.4, consulte a
[avaliação atual](narrative-evaluation.md#resultado-real-e-revisão-técnica).

01/11/2026. **Conexão e uma resposta narrativa estruturada validadas com Gemini 3.5
Flash-Lite.** A qualidade da amostra é parcial; o Mestre de produção ainda não está
certificado para narração livre ou campanha autônoma.

## Autorizações e resultado

A responsável confirmou projeto sem faturamento. Autorizou inicialmente até duas
requisições em 2.5; uma retornou 404 e a execução parou. Depois autorizou até duas
novas em 3.5, com teto de três tentativas nesta fase. Cada experimento tinha até
446 tokens de saída e nenhum fallback/retry. Todas as três tentativas estão abaixo.

| Caso               | Modelo                  | Resultado                                |       Entrada |         Saída |         Total | Latência |
| ------------------ | ----------------------- | ---------------------------------------- | ------------: | ------------: | ------------: | -------: |
| Smoke inicial      | `gemini-2.5-flash-lite` | HTTP 404 / MODEL_UNAVAILABLE             | Não reportada | Não reportada | Não reportado | 1.700 ms |
| Conexão            | `gemini-3.5-flash-lite` | Frase esperada recebida                  |           577 |            17 |           594 | 2.176 ms |
| Rascunho narrativo | `gemini-3.5-flash-lite` | JSON válido, 95 palavras, eventIds vazio |           799 |           160 |           959 | 3.427 ms |

Total reportado nas chamadas bem-sucedidas: **1.376 tokens de entrada + 177 de saída
= 1.553 totais**. Contagem da tentativa 404 é desconhecida, não consumo zero
comprovado. Não houve RATE_LIMIT, retry, fallback ou chamada além do teto autorizado.
A resposta de conexão foi: “Mestre de RPG conectado com sucesso.”

Evidências sanitizadas: [tentativa 2.5](phase-5.3-live-result.json),
[conexão e rascunho 3.5](phase-5.3-live-35-result.json). A chave não foi impressa,
levada ao frontend ou copiada para testes. O CLI não leu campanhas/PDFs nem escreveu
mensagens, eventos, sessões ou recursos. Métricas reais deste experimento estão nos
JSONs, não em uma sessão do banco real.

A [documentação de acesso 2.5](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite)
limita acesso a usuários anteriores. Isso é compatível com o 404, mas não prova a
causa específica da chave; não se declara encerramento global do modelo.
O [tier Free Standard 3.5](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)
foi conferido antes da aprovação/execução. A confirmação financeira da responsável,
e não a mera existência de chave ou posição na linha de produtos, permitiu o teste.

## Configuração resultante

O default foi atualizado para `gemini-3.5-flash-lite` em Settings, Compose e exemplo
de ambiente após a resposta real bem-sucedida. Não havia GEMINI_MODEL no `.env`,
então ele passa a ser também o modelo efetivo local. Overrides explícitos de outras
instalações são preservados. A allowlist mantém 2.5 para contas legadas e não há troca
silenciosa automática em erros.

`AI_FREE_TIER_CONFIRMED=true` foi aplicado somente aos processos autorizados. O
ambiente normal continua com a flag falsa, respeitando o escopo do experimento.
Groq continua desativado e sem confirmação independente. Nenhuma nova chamada está
autorizada por esta entrega: o orçamento dos experimentos foi encerrado.

O token interno ausente foi gerado no `.env` ignorado, sem exibição. NestJS/FastAPI
precisam reiniciar para carregar configuração; esse segredo não é a chave Gemini.
Não houve mudança de billing, cadastro de cartão, serviço adicional ou banco real.

## Avaliação e reprodução

A amostra conserva o rumor como incerto e não controla Naelis; sua ligação com a
pergunta ficou artificial e incluiu um detalhe espacial não fornecido. Não foi
publicada no chat nem promovida a fato canônico. A [revisão técnica inicial](narrative-quality-report.md)
não substitui revisão humana e duas sessões reais.

O módulo `app.evaluation.live` exige flag de autorização e confirmação financeira,
faz smoke (até 96 tokens) e só depois rascunho (até 350), sem loops de reparo. O
comando abaixo registra como o segundo experimento foi executado, **não autoriza
reexecução** sem novo orçamento:

```sh
AI_FREE_TIER_CONFIRMED=true GEMINI_MODEL=gemini-3.5-flash-lite node scripts/uv.mjs run python -m app.evaluation.live --authorize-live --max-requests 2
```

Sem `--authorize-live`, a execução retornou LIVE_AUTHORIZATION_REQUIRED, requests=0,
saída 1. A suíte automatizada usa apenas mocks e nunca dispara APIs externas.
