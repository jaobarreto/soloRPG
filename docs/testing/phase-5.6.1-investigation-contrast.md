# Fase 5.6.1 — contraste real entre 561-03 e 561-04

01/11/2026. **Amostra real direcionada aprovada para os dois cenários avaliados.**
Foram executadas exatamente duas tentativas, uma por cenário; ambas passaram na
seleção semântica, no contrato e na política local. A execução foi encerrada.
Isso não aprova toda a Fase 5.6.1, a campanha ou a autonomia geral da Una.

## Autorização e controle do experimento

O operador autorizou exclusivamente 561-03 e 561-04, com uma tentativa por cenário,
máximo de duas requisições Gemini no modelo `gemini-3.5-flash-lite`, 700 tokens de
saída por chamada, sem retries, reparos, fallback, alteração de faturamento, mudança
permanente da `.env` ou escrita em campanha/banco real. Erros críticos interrompem;
uma divergência semântica isolada e segura permite continuar ao outro cenário.

A chave continua sendo a da `.env` previamente identificada pelo operador como
pertencente ao projeto gratuito verificado, sem faturamento. Não há override de
chave no ambiente, a `.env` conserva o hash original e a proteção financeira
normal continua false. A identificação financeira é a atestação do operador; não
foi feita consulta adicional a serviços Google de administração ou billing.

A conferência de hashes encontrou a mesma implementação de produção, prompt,
schemas, contexto de seleção, política NestJS e plano da confirmação anterior.
**Não houve alteração de prompt, schema ou expectativa durante o experimento.**

O orquestrador ganhou, antes da execução, `--case-ids`, validado sem SDK antes de
criar o recibo. IDs desconhecidos, vazios, duplicados ou acima do orçamento são
recusados. O NestJS recebe o JSON original capturado do SDK. Nenhum campo é
normalizado para recuperar um resultado inválido. Os 18 testes do avaliador
passaram antes das chamadas, incluindo uma seleção QUERY incorreta bloqueada no
561-03 e a continuação segura ao 561-04, sem retry ou crédito semântico pelo bloqueio.

Foi utilizada a interface inspecionada por `--help`:

```sh
AI_FREE_TIER_CONFIRMED=true node scripts/uv.mjs run python -m app.evaluation.phase561 --authorize-live --operator-key-confirmed --max-requests 2 --case-ids 561-03 561-04 --output /home/barreto/Desktop/projetos/soloRPG/docs/ai/phase-5.6.1-investigation-contrast-live-result.json
```

Cada cenário usa o grafo, projeção do planner, prompt, roteador e adaptador Gemini
de produção, com uma chamada PROPOSE limitada a 700 tokens. O SDK permanece com
attempts=1 e o roteador limita cada cenário a uma requisição. O arquivo de recibo
é criado exclusivamente; não foi sobrescrito ou usado para repetir o lote.
Gabaritos ficam no avaliador e não são enviados ao modelo.

## A variável que mudou

Mensagem original, idêntica nos dois casos:

> Examino a porta procurando algum mecanismo escondido.

Os contextos originais diferem **apenas em `options`**. Personagens, disponibilidade,
mundo e informações públicas são idênticos. Cada cenário mantém seus próprios IDs
sintéticos de requisição/campanha/sessão, sem estado compartilhado ou escrita.

| Contexto                       | 561-03                                                         | 561-04                |
| ------------------------------ | -------------------------------------------------------------- | --------------------- |
| Porta                          | Presente e acessível                                           | Idêntica              |
| Conhecimento do mecanismo      | Ainda não confirmado                                           | Ainda não confirmado  |
| Descrição pública              | Madeira e fechadura de metal visível, riscada e sem ornamentos | Idêntica              |
| Capacidade disponível          | Examinar a porta, ACT, requiresCheck=true, vinculada à Porta   | Nenhuma: options=[]   |
| Projeção recebida pelo planner | checks=[Examinar a porta, alvo Porta]                          | checks=[]             |
| Gabarito de intenção/expressão | INVESTIGATE / DIRECT                                           | INVESTIGATE / DIRECT  |
| Gabarito de ferramenta         | PREPARED_CHECK com capacidade exata                            | ADJUDICATE ou CLARIFY |

A solução oculta, dificuldade e efeitos não foram enviados ao Gemini. A fonte
pública da Porta é permitida como evidência adicional pelo plano original nos dois
casos. Sua seleção fornece referência à cena; não comprova descoberta do mecanismo.

## JSONs efetivamente recebidos

561-03:

```json
{
  "kind": "FREE",
  "intent": "INVESTIGATE",
  "description": "Naelis examina a porta procurando algum mecanismo escondido.",
  "target": {
    "type": "WORLD",
    "name": "Porta"
  },
  "expression": "DIRECT",
  "evidence": ["info-59f40a209c6f283318a8d3fe"],
  "tool": {
    "type": "PREPARED_CHECK",
    "capability": "Examinar a porta"
  }
}
```

561-04:

```json
{
  "kind": "FREE",
  "intent": "INVESTIGATE",
  "description": "Naelis examina a porta procurando algum mecanismo escondido.",
  "target": {
    "type": "WORLD",
    "name": "Porta"
  },
  "expression": "DIRECT",
  "evidence": ["info-59f40a209c6f283318a8d3fe"],
  "tool": {
    "type": "ADJUDICATE"
  }
}
```

Fonte PUBLIC selecionada nos dois:

> Porta: madeira escura com fechadura de metal visível, riscada e sem ornamentos.

## Avaliação separada dos cinco critérios

| Critério                  | 561-03: teste preparado                           | 561-04: sem política preparada                               |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| Intenção reconhecida      | INVESTIGATE, correta                              | INVESTIGATE, correta                                         |
| Ferramenta selecionada    | PREPARED_CHECK, correta                           | ADJUDICATE, correta                                          |
| Capacidade ou ausência    | Nome exato Examinar a porta, alvo Porta           | Não fabrica capacidade ou teste; encaminha adjudicação       |
| Contrato                  | JSON original aceito por SelectedFreeAction e Zod | JSON original aceito por SelectedFreeAction e Zod            |
| Política NestJS           | AUTHORIZED; MECHANIC ligado à opção preparada     | ADJUDICATE; UNSUPPORTED_CAPABILITY, sem autorização mecânica |
| Resultado semântico final | Aprovado                                          | Aprovado                                                     |

Expressão DIRECT, alvo, fonte e parâmetros também passaram conforme o gabarito
congelado. As duas respostas foram revalidadas diretamente a partir de `rawResponse`
no Pydantic e no replay NestJS, com igualdade entre o JSON bruto e os campos
validados. A revalidação offline não consome chamadas ao provedor.

No 561-03, o NestJS retornou **“A tentativa aguarda o teste oficial.”**, categoria
MECHANIC, com a opção preparada original. É autorização da proposta para o fluxo
de teste; o replay não rola dados, chama o motor ou confirma descoberta. Não houve
invenção de dificuldade, resultado, sucesso ou efeito pelo modelo.

No 561-04, o **próprio Gemini selecionou ADJUDICATE**. O NestJS conservou essa
resolução com motivo UNSUPPORTED_CAPABILITY e texto informando que nenhum efeito
foi aplicado. O rótulo técnico LIMITED_OR_REFUSED significa ausência de autorização
para efeito mecânico nesse contexto. A proposta de adjudicação está correta; não
é uma ferramenta errada corrigida pelo backend nem um fallback creditado como acerto.

## Consumo reportado e limites

| Caso               | Provedor/modelo                | Entrada   | Saída   | Total     | Latência                | Erros  |
| ------------------ | ------------------------------ | --------- | ------- | --------- | ----------------------- | ------ |
| 561-03             | Gemini / gemini-3.5-flash-lite | 2.066     | 144     | 2.210     | 2.132 ms                | Nenhum |
| 561-04             | Gemini / gemini-3.5-flash-lite | 2.044     | 132     | 2.176     | 2.036 ms                | Nenhum |
| Total desta rodada | Mesmo modelo                   | **4.110** | **276** | **4.386** | **4.168 ms acumulados** | Nenhum |

Foram **2/2 tentativas**, duas respostas contratualmente válidas, duas seleções
semânticas corretas, zero seleções incorretas, zero falhas de schema e zero erros
de fundamentação observados. Não houve propostas semanticamente indevidas bloqueadas:
a adjudicação do 561-04 era a resposta apropriada. O provedor reportou consumo nas
duas chamadas; não há valores desconhecidos substituídos por zero.

Nenhuma chamada ultrapassou 700 tokens de saída. Retries, reparos, fallback de
provedor, troca de modelo e chamadas literárias adicionais: **zero**.
O modelo reportado nas duas respostas corresponde ao solicitado.

A soma histórica da 5.6.1, incluindo as duas tentativas anteriores do 561-01, é
**quatro tentativas**, 8.300 tokens de entrada + 551 de saída = 8.851 totais
reportados, com 7.880 ms acumulados. Os recibos anteriores foram preservados.

## Comparação com 5.4, pendências e decisão

Na 5.4, a investigação com capacidade preparada produziu INVESTIGATE + QUERY/LOCATION.
Nesta chamada do 561-03, o modelo escolheu diretamente PREPARED_CHECK e a capacidade
correta. O erro anterior não se repetiu nesta amostra. O 561-04 acrescenta evidência
real de que a ausência da capacidade muda a seleção para ADJUDICATE.

O contraste observado foi produzido pelo Gemini. O NestJS confirmou as duas
resoluções, sem substituir uma seleção errada por uma saída segura. Não se trata
somente de ausência de efeitos indevidos: houve seleção adequada ao contexto.

A pendência do 561-01 **permanece registrada**: a confirmação anterior retornou
DIRECT quando QUESTION era esperado. Seu gabarito e seus recibos não foram alterados.
Esta rodada não a reavalia nem a resolve. Os casos 561-02 e 561-05 a 561-08 continuam
sem execução real; não se declara aprovação da amostra original completa.

**Decisão: amostra real direcionada aprovada para o contraste 561-03/561-04.**
A evidência é de uma resposta por contexto, com uma capacidade ou sua ausência;
não comprova inteligência geral, autonomia completa da Una ou validação da campanha.

Após as duas respostas, a execução foi encerrada. Não há nova chamada iniciada ou
agendada. Hashes confirmam preservação dos prompts, schemas, expectativas, `.env`,
adaptador, política e orquestrador durante a rodada. A proteção financeira normal
continua false. Não houve escrita em banco/campanhas, alteração de regras/PDFs ou
início da Fase 5.7.

## Artefatos

- [Preflight e hashes de contexto/implementação](../ai/phase-5.6.1-investigation-contrast-preflight.json).
- [JSONs brutos, métricas e replay por chamada](../ai/phase-5.6.1-investigation-contrast-live-result.json).
- [Avaliação comparativa e revalidação dos JSONs originais](../ai/phase-5.6.1-investigation-contrast-review.json).
