# Fase 5.6.1 — correção offline do schema Gemini

01/11/2026. **Correção offline validada; confirmação real pendente.**
Nenhuma chamada externa ou Gemini foi executada nesta correção. A única tentativa
real histórica continua sendo o 561-01, interrompido por schema inválido. Os casos
561-03 e 561-04 não foram chamados.

Atualização posterior: a [confirmação real autorizada separadamente](phase-5.6.1-case561-01-confirmation.md)
aceitou o envelope FREE no Pydantic e no Zod. Houve divergência semântica
DIRECT/QUESTION, registrada no novo relatório; nenhum caso adicional foi chamado.
As evidências abaixo descrevem a etapa offline anterior.

## Diagnóstico reproduzido

O [recibo original](../ai/phase-5.6.1-live-result.json) contém uma seleção correta de
consulta e fonte, mas `kind: "QUERY"` em vez do literal obrigatório `FREE`.
Pydantic e Zod recusam esse envelope. A recuperação CLARIFY não demonstra um acerto
operacional do Gemini e o resultado real anterior permanece **BLOQUEADA**.

Foi adicionado um teste na fronteira HTTP do SDK oficial instalado, google-genai
1.75.0, usando o adaptador de produção e `httpx.MockTransport`. Os métodos de conexão
de sockets são bloqueados nos novos testes Python; a chave usada é fictícia.
O transporte captura o corpo serializado pelo SDK, sem contato com servidor.

Antes da correção, o comando abaixo falhou em 0,82 s:

```sh
node scripts/uv.mjs run pytest tests/test_gemini_schema.py::test_sdk_wire_requires_free_without_mutating_local_schema -q
```

A falha comparou `responseJsonSchema.properties.kind`:

```json
{ "const": "FREE", "title": "Kind", "type": "string" }
```

com a representação esperada para geração:

```json
{ "enum": ["FREE"], "title": "Kind", "type": "string" }
```

Isso comprova que o SDK conservava o `const` recebido do Pydantic. Não comprova,
sem nova geração real, por que o serviço remoto devolveu um literal diferente.
Foram consideradas as hipóteses de limitação remota de `const`, alteração pelo SDK
e violação do literal pelo modelo. A captura exclui uma conversão prévia do SDK
para enum; a distinção entre comportamento remoto e modelo continua pendente.

## Alteração aplicada

`apps/ai-service/app/providers/gemini.py` ganhou `gemini_generation_schema`:
uma cópia recursiva do schema de geração que representa cada `const` emitido pelo
Pydantic como enum de um único valor. Isso inclui `kind`, os discriminadores dos
tipos de ferramenta e o literal booleano de confirmação de sustento.

O adaptador aplica essa conversão exclusivamente no `response_json_schema` enviado
ao SDK. `$defs`, `$ref`, `anyOf`, campos obrigatórios, enumerações existentes,
tipos e `additionalProperties: false` são conservados. As simplificações anteriores
de limites de tamanho para NARRATE continuam separadas e inalteradas.

O Pydantic continua com `kind: Literal["FREE"]`. O Zod continua com
`kind: z.literal('FREE')`. A resposta do SDK continua passando diretamente por
`output_schema.model_validate_json`; nenhum campo da resposta é substituído ou
normalizado. Não houve mudança nos contratos, prompts, contexto de seleção,
política NestJS, configuração financeira, provedores, modelo, retries ou fallback.

## Evidências dos quatro critérios

| Critério                     | Teste e resultado                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| O schema enviado exige FREE  | Captura HTTP real do SDK com transporte em memória: `kind` obrigatório, `type=string`, `enum=["FREE"]`; nenhum `const` restante. Também confere prompt, teto de 700 tokens, referências de ferramentas e campos obrigatórios.                                                                          |
| QUERY continua inválido      | O conteúdo bruto do recibo real passa pelo SDK simulado e pelo adaptador de produção, que retorna INVALID_RESPONSE com `kind:literal_error`. O objeto recebido permanece intacto e ocorre uma única invocação do transporte. Zod também recusa o mesmo recibo.                                         |
| Python e NestJS compatíveis  | 101 propostas da matriz e oito fixtures direcionadas, **109 no total**, aceitas em ambos; serialização Python → Zod e Zod → Python verificadas. Nove propostas inválidas, incluindo o recibo, discriminadores inválidos, campo administrativo, campo extra e limite de descrição, recusadas por ambos. |
| Sem regressão de ferramentas | 101 fixtures atravessam grafo, roteador, adaptador Gemini e SDK oficial com transporte simulado. Intenção, ferramenta, expressão e evidências são preservadas. A matriz NestJS continua produzindo as categorias esperadas, inclusive bloqueios adversariais e contraste preparado/sem política.       |

Os contratos de transporte legados mantêm campos opcionais de compatibilidade;
`SelectedFreeAction` exige expressão e evidências na geração nova. A correção não
altera essa distinção existente. As fixtures roteirizadas não medem inteligência
ou acurácia semântica real do Gemini.

## Verificações executadas

```sh
node scripts/uv.mjs run pytest tests/test_gemini_schema.py tests/test_providers.py tests/test_phase56.py tests/test_phase561.py -q --cov=app.providers.gemini --cov-report=term-missing --cov-report=json:/tmp/khaos561-schema-coverage.json
.tools/node_modules/.bin/pnpm --filter @solo-rpg/shared-contracts build
.tools/node_modules/.bin/pnpm --filter @solo-rpg/api exec jest --runInBand test/phase561-schema.spec.ts test/phase56.spec.ts test/free-action.spec.ts
```

- **254 testes Python passaram**, com **96% de cobertura do adaptador Gemini**.
- **151 testes NestJS passaram**, incluindo os dois testes de compatibilidade
  entre linguagens, a matriz semântica e o interpretador livre.
- Ruff, mypy do adaptador, ESLint e Prettier do novo teste TypeScript passaram.

A primeira execução NestJS teve timeout do subprocesso Python dentro do sandbox;
a mesma suíte passou fora dele em 2,032 s. Não foi necessário modificar a política
ou relaxar validação para fazê-la passar. O subprocesso importa apenas os contratos
Pydantic, lê JSON local e não instancia SDK, aplicação ou banco.

[Evidência estruturada e hashes de preservação](../ai/phase-5.6.1-schema-fix.json).
O `.env`, os contratos Python/Zod, o prompt, a política de seleção e os recibos/planos
históricos mantiveram os mesmos hashes. Nenhum documento de regras ou PDF foi editado.

## Limite e próxima etapa

A correção está pronta para confirmação, mas não foi comprovada por geração remota.
A autorização atual cobre somente trabalho offline. Nenhuma chamada para 561-01,
561-03 ou 561-04 foi iniciada, agendada ou autorizada por esta alteração.

A próxima etapa poderá ser **uma única tentativa real do 561-01**, com a mensagem
e o contexto originais, mesmo modelo e limite de 700 tokens, após autorização
expressa do operador. Sua aprovação não autoriza os casos 561-03/561-04, que dependem
de confirmação e autorização separadas. Nenhuma Fase 5.7 foi iniciada.
