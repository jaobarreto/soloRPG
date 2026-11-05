# Fase 5.6.1 — confirmação real do 561-01 após a correção de schema

01/11/2026. **Schema confirmado nesta tentativa real; caso não aprovado
integralmente por divergência de expressão. Execução encerrada após uma chamada.**

## Autorização e preservação

O operador autorizou expressamente uma única tentativa Gemini para o 561-01,
implementação atual, modelo `gemini-3.5-flash-lite`, máximo de 700 tokens de saída,
sem retries, fallback, troca de modelo, alteração permanente de `.env`, alteração
de faturamento ou escrita em campanhas/banco real. A mesma conversa já confirmou
que a chave ativa pertence ao projeto gratuito verificado, com billing desativado.
Essa informação permanece uma atestação do operador; não houve consulta adicional
a serviços Google para obter metadados de projeto ou faturamento.

O preflight verificou que a mensagem e o contexto coincidem integralmente com o
registro original, que a `.env` mantém o mesmo hash e que não há override da chave
no ambiente. Provider, modelo e fallback conferem. O schema de geração corrigido
exige `kind` obrigatório com `enum: ["FREE"]`, preservando o Pydantic original.
Nenhum prompt, contrato, fixture ou adaptador foi modificado nesta confirmação.

Foi usado o orquestrador existente com limite de uma requisição. A confirmação
gratuita ficou ativa apenas no processo abaixo:

```sh
AI_FREE_TIER_CONFIRMED=true node scripts/uv.mjs run python -m app.evaluation.phase561 --authorize-live --operator-key-confirmed --max-requests 1 --output /home/barreto/Desktop/projetos/soloRPG/docs/ai/phase-5.6.1-case561-01-schema-confirmation.json
```

O replay NestJS usa as funções de produção compiladas após build da API, sem
iniciar a aplicação, chamar banco ou executar efeitos. Depois da chamada, a
resposta bruta foi novamente validada diretamente por `SelectedFreeAction` e pelo
script local NestJS, sem substituir campos ou usar a proposta corrigida de fixture.

## Resposta efetivamente recebida

Mensagem original: **“O que eu já descobri sobre essa porta?”**

```json
{
  "kind": "FREE",
  "intent": "QUERY",
  "description": "Naelis consulta suas lembranças e investigações anteriores sobre a porta.",
  "target": {
    "type": "WORLD",
    "name": "Porta"
  },
  "expression": "DIRECT",
  "evidence": ["info-b8009dbd5409f0d34e434465"],
  "tool": {
    "type": "QUERY",
    "subject": "MEMORY"
  }
}
```

Fonte KNOWN selecionada: **“Uma investigação anterior confirmou que a fechadura
da Porta está danificada.”** É a chave exata esperada pelo plano original.

## Validação e resultado

| Dimensão           | Esperado                      | Observado                           | Resultado     |
| ------------------ | ----------------------------- | ----------------------------------- | ------------- |
| Envelope           | `kind=FREE`                   | `kind=FREE`                         | Aprovado      |
| Intenção           | QUERY                         | QUERY                               | Aprovado      |
| Ferramenta/assunto | QUERY/MEMORY                  | QUERY/MEMORY                        | Aprovado      |
| Alvo               | Porta                         | WORLD/Porta                         | Aprovado      |
| Fonte              | KNOWN da descoberta anterior  | Fonte KNOWN exata                   | Aprovado      |
| Expressão          | QUESTION                      | DIRECT                              | **Reprovado** |
| Contrato Pydantic  | Resposta original válida      | Válida, sem normalização            | Aprovado      |
| Contrato Zod       | Resposta original válida      | Válida                              | Aprovado      |
| Autorização NestJS | Consulta da fonte, sem efeito | AUTHORIZED, categoria QUERY         | Aprovado      |
| Renderer local     | Somente texto da fonte        | Texto literal da fonte, eventIds=[] | Aprovado      |

O NestJS autorizou a consulta e retornou:

> Uma investigação anterior confirmou que a fechadura da Porta está danificada.

Não foram selecionados teste, rolagem, conjuração ou ferramenta administrativa.
Nenhuma descoberta nova ou mudança de estado foi proposta/confirmada. A proposta
não foi bloqueada por segurança: QUERY/MEMORY e sua fonte estão autorizados.
O replay somente calcula essa autorização; não publica mensagens em campanha.

**Causa observada da reprovação:** o modelo usou `expression=DIRECT` em uma
pergunta cujo gabarito congelado exige `QUESTION`. É uma divergência na classificação
do ato da mensagem. Os demais campos de seleção estão corretos. DIRECT é um valor
estruturalmente válido no enum; Pydantic e Zod não decidem se esse rótulo corresponde
semanticamente à frase em português. Sua aceitação estrutural não elimina o erro.

Não houve erro de schema nesta tentativa. A correção de geração de FREE foi
confirmada nesta resposta real; uma chamada não comprova confiabilidade universal
da gramática nem resolve automaticamente a classificação de expressão. Não foi
alterado o gabarito para tratar DIRECT como acerto, nem foi feita chamada de reparo.

## Consumo e limites

| Métrica desta autorização                              | Resultado             |
| ------------------------------------------------------ | --------------------- |
| Provedor                                               | Gemini                |
| Modelo solicitado e reportado                          | gemini-3.5-flash-lite |
| Tentativas / limite                                    | **1 / 1**             |
| Respostas válidas pelo schema                          | 1                     |
| Falhas de schema                                       | 0                     |
| Casos aprovados integralmente                          | 0                     |
| Divergências semânticas                                | 1: EXPRESSION         |
| Tokens de entrada reportados                           | 2.095                 |
| Tokens de saída reportados                             | 138 / limite 700      |
| Tokens totais reportados                               | **2.233**             |
| Latência reportada                                     | **2.040 ms**          |
| Consumo desconhecido                                   | Não: uso reportado    |
| Retries, fallback de provedor, reparos ou NARRATE real | 0                     |
| Erros do provedor e da validação estrutural            | Nenhum                |

A soma histórica das duas tentativas 5.6.1 é 4.190 tokens de entrada + 275 de saída
= 4.465 totais reportados, com 3.712 ms de latência acumulada. A primeira tentativa
e esta confirmação mantêm recibos separados; a falha original não foi apagada.

## Encerramento e evidências

Após a execução, os hashes de todos os arquivos congelados continuam idênticos aos
do preflight, incluindo `.env`, prompt, contratos, adaptador corrigido e plano.
`AI_FREE_TIER_CONFIRMED` permanece false na configuração normal. Nenhuma alteração
de faturamento, modelo, chave ou banco foi realizada. Nenhum PDF ou documento de
regras foi modificado e nenhuma Fase 5.7 foi iniciada.

**A autorização foi integralmente consumida e a execução terminou.** Não foi
iniciada ou agendada nova tentativa. Os casos 561-03 e 561-04 não foram executados;
os demais casos também não foram chamados. A amostra completa da Una permanece
sem aprovação real. A pendência observada neste caso é classificar a pergunta como
QUESTION; o erro anterior do envelope não reapareceu nesta tentativa.

- [Preflight e identidade do contexto](../ai/phase-5.6.1-case561-01-confirmation-preflight.json).
- [Recibo bruto da única chamada](../ai/phase-5.6.1-case561-01-schema-confirmation.json).
- [Revisão e revalidação direta da resposta original](../ai/phase-5.6.1-case561-01-confirmation-review.json).
