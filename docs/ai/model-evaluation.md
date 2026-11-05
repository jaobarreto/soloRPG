# Avaliação dos modelos — Fase 5.3

Consulta pública: 01/11/2026. Ambiente inspecionado sem imprimir credenciais.

| Provedor                   | Modelo                  | Modalidade                                           | Conta / autorização                                      | Medição real                                                        |
| -------------------------- | ----------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| Gemini, default final      | `gemini-3.5-flash-lite` | Free Standard publicado                              | Projeto sem billing confirmado; dois pedidos autorizados | Smoke e narrativa: 2.176 / 3.427 ms; 1.553 tokens totais reportados |
| Gemini, default inicial    | `gemini-2.5-flash-lite` | Free Standard, acesso restrito a usuários anteriores | Experimento inicial autorizado                           | Uma tentativa HTTP 404, 1.700 ms, sem usage                         |
| Gemini, alternativa legada | `gemini-2.5-flash`      | Tier gratuito publicado; acesso legado               | Não autorizado para comparação                           | Não avaliado                                                        |
| Groq, fallback desativado  | `openai/gpt-oss-20b`    | Free Plan publicado                                  | Sem confirmação independente                             | Não avaliado                                                        |

A [tabela oficial Gemini](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-lite)
lista o tier gratuito do modelo. Isso não confirma o estado financeiro do projeto
associado à chave. A responsável confirmou ausência de billing e autorizou os experimentos 2.5 e 3.5.
A confirmação foi aplicada só ao processo; o ambiente normal segue bloqueado.
O default final é 3.5 após validação. Billing e flags financeiras persistidas não foram alterados.

Os [limites Gemini](https://ai.google.dev/gemini-api/docs/rate-limits) dependem do
projeto/tier e são consultáveis no AI Studio: RPM, TPM de entrada e RPD. A documentação
não garante capacidade. Não foram inventadas cotas para esta chave. A
[tabela Groq Free Plan](https://console.groq.com/docs/rate-limits) lista, para
`openai/gpt-oss-20b`, 30 RPM, 1.000 RPD, 8.000 TPM e 200.000 TPD na consulta;
esses limites não são evidência sobre a conta local nem autorização para fallback.

Gemini utiliza `google-genai`, resposta JSON Schema e validação Pydantic local.
[Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) auxiliam
o formato; não provam coerência narrativa, agência ou legalidade de um comando.
Não há ranking de qualidade: nenhum modelo foi comparado em RPG real nesta entrega.

Erros simulados: 400/413/422 (requisição), 401/403 (autenticação), 404 (modelo),
429 (limite), 5xx, timeout, conexão e resposta inválida. Tentativas são limitadas;
nenhum erro habilita modelo pago. SDK inesperado recebe código sanitizado.

O primeiro teste real retornou 404 / MODEL_UNAVAILABLE; sem retry e sem narração nesse modelo.
A [documentação de acesso 2.5](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite)
restringe novos usuários, compatível com esse erro, sem provar a causa desta chave.
Não se infere encerramento global do modelo nem autenticação certificada.

`gemini-3.5-flash-lite` foi acrescentado à allowlist como candidato configurável,
com [Free Standard publicado](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite).
Depois da autorização adicional, conexão e uma narrativa curta responderam com
sucesso. Foram reportados 1.376 tokens de entrada, 177 de saída e 1.553 totais. O
default foi atualizado para 3.5. A qualidade preliminar tem ressalvas de coerência e
voz; não há comparação literária entre modelos nem medição de cota para duas horas.
[Experimentos](live-model-validation.md), [revisão da amostra](narrative-quality-report.md).
