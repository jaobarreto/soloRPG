# Provedores gratuitos

Consulta às fontes oficiais em 30/10/2026:

- [Preços Gemini](https://ai.google.dev/gemini-api/docs/pricing): tiers gratuitos
  para `gemini-2.5-flash-lite` e `gemini-2.5-flash`.
- [Limites Groq](https://console.groq.com/docs/rate-limits): tabela Free Plan para
  `openai/gpt-oss-20b` e `openai/gpt-oss-120b`.
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
  e [Groq JSON mode](https://console.groq.com/docs/structured-outputs).
- [LangGraph Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api).

O adaptador Gemini usa SDK oficial `google-genai`; Groq usa cliente compatível
OpenAI com httpx e validação Pydantic local. Modelos são configuráveis por ambiente,
limitados a uma allowlist verificada. Não há inferência paga, grounding, busca,
cache pago, embeddings externos ou troca automática para modelo fora da lista.

```env
AI_INTERNAL_TOKEN=<segredo aleatório igual em NestJS e FastAPI>
AI_FREE_TIER_CONFIRMED=true
LLM_PROVIDER=gemini
GEMINI_API_KEY=<chave de projeto sem faturamento>
GEMINI_MODEL=gemini-2.5-flash-lite
GROQ_API_KEY=<opcional, conta Free>
GROQ_MODEL=openai/gpt-oss-20b
ENABLE_PROVIDER_FALLBACK=false
LLM_TIMEOUT_SECONDS=20
```

Use AI_FREE_TIER_CONFIRMED apenas depois de conferir que a conta/projeto não possui
faturamento habilitado. A aplicação não consegue demonstrar o tier financeiro da
chave. Ter um modelo com modalidade gratuita não torna uma chave faturada gratuita.
Quotas e elegibilidade mudam; consultar o painel do provedor antes do uso.

Um único provedor basta. Fallback, quando habilitado e a segunda chave configurada,
ocorre apenas para 429, timeout, conexão e 5xx. Autenticação, modelo inexistente,
contexto/payload inválido e saída malformada não causam tentativas automáticas.
Cada provedor é chamado no máximo uma vez por etapa. O SDK Gemini também limita
suas próprias tentativas. Não há loops de correção nem fallback pago.

O caminho com consequências usa uma chamada estruturada para propor e outra após
commit para narrar; a oficialização tem prioridade sobre economizar uma chamada.
Resumo e Director são determinísticos. Erros mantêm o turno e a mensagem no banco.
A UI permite retomar; após commit, só a narração é repetida.

`ai_usage` salva provedor/modelo, tokens retornados pelo SDK, duração e códigos
sanitizados, inclusive tentativas de fallback. Erros sem contagem de tokens não
permitem estimar consumo real. `GET .../ai-usage` agrega os contadores sem prompts,
segredos ou chaves. Não há cobrança ou configuração de billing.

Os testes usam transportes simulados. Sem chaves e confirmação do tier no ambiente
de desenvolvimento, não foi possível validar latência, qualidade ou quotas reais.
