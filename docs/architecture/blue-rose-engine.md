# Blue Rose AGE — contratos mecânicos

Recorte `blue-rose-age-2e/0.1.0`, edição AGE Green Ronin; livro brasileiro Jambô 2023.
[Fontes e regras](../rules/blue-rose-implementation.md), [limites](../rules/blue-rose-pending-rules.md).

## Rolagens, pedidos e resultados

`BlueRoseDice` usa `node:crypto.randomInt(1, 7)`, com `RandomSource.d6()` injetável.
Preserva três faces; a terceira é sempre o Drama Die. Dados de dano também são
produzidos no servidor e preservados no diff de auditoria. Nunca se aceitam faces,
expressões arbitrárias, dano, TN ou modificadores mecânicos no HTTP da jogadora.

- Livre: `{commandId, sessionId}` produz 3d6 sem sucesso/fracasso ou SP.
- Teste preparado: `{commandId, requestId}` resolve teste básico, oposto ou tentativa
  prolongada. O backend relê atributos, foco e fadiga. O operador prepara contexto e
  dificuldade; a jogadora não define esses valores. Pedidos secretos só se resolvem
  pela CLI e não aparecem em consultas públicas.
- Ataque: consome uma ação maior, confere turno, alvo, arma equipada/treinada, alcance,
  recarga e Defesa. Se gerar SP, o dano aguarda a escolha imediata de Stunts. Sem SP,
  o dano é aplicado na mesma transação do ataque.

`availableStuntPoints` reflete apenas um ataque pendente de resolução. O histórico
registra SP gerados mesmo depois de descartados; isso não forma uma reserva futura.
`COMBAT_RESOLVE` recebe uma lista de Stunts, valida custo total e repetição na rodada,
rola o dano adicional e aplica os efeitos. Confirmação sem Stunts ou `END_TURN`
descarta os pontos restantes. Outra ação é rejeitada enquanto houver essa janela.
Encerrar o encontro também resolve o dano pendente sem Stunts. Sessões não podem ser
concluídas enquanto houver um encontro ativo; pausar/retomar preserva o mesmo turno.

O combate atual suporta níveis 1–2, a pé e todos cientes do encontro. Posições usam
metros num plano aberto; não há paredes ou linha de visão parcial. Perfis de armadura,
escudo, treinamento e deslocamento são aprovados localmente. Defesas e dano derivam
então desses perfis e da ficha, nunca do cliente. Empate completo de iniciativa é
rejeitado para adjudicação; empate completo oposto retorna sucesso nulo.

Curar é específico de Blue Rose: requer conhecimento e talento da tradição de Cura,
toque aprovado, alvo vivo, teste próprio, cura limitada ao máximo e teste de fadiga.
O uso é em tempo narrativo nesta versão. A fadiga é persistente e penaliza testes;
o NA dos usos fatigantes sucessivos aumenta até uma pausa. Repetir cura sobre o
mesmo alvo exige que o alvo faça uma pausa. Descanso é um comando local que atesta
passagem de cinco minutos ou seis horas de jogo, não um botão de cura no navegador.

## Administração local

A CLI abre apenas contexto Nest, sem listener HTTP:

```sh
pnpm --filter @solo-rpg/api engine:command /tmp/comando.json
```

Envelope estrito para comandos locais:

```json
{
  "campaignId": "00000000-0000-4000-8000-000000000001",
  "sessionId": "00000000-0000-4000-8000-000000000002",
  "commandId": "00000000-0000-4000-8000-000000000003",
  "command": {
    "type": "CHECK_PREPARE",
    "characterId": "00000000-0000-4000-8000-000000000004",
    "ability": "DEXTERITY",
    "focusId": "dexterity-stealth",
    "targetNumber": 13,
    "modifier": 0,
    "reason": "Passar sem ser percebida",
    "visibility": "PUBLIC",
    "stuntsEligible": true
  }
}
```

IDs são ilustrativos. Um UUID novo identifica cada comando; repetir o mesmo UUID e
conteúdo devolve seu recibo sem reaplicar efeitos. Em `DRAFT`, preparação pode omitir
sessão. Testes, combate, arcanos, descanso e inventário em ação exigem sessão ativa.
`GM_ONLY` só pode ser resolvido pela CLI. Não existe dispatcher administrativo HTTP.
O contrato executável completo é `apps/api/src/game-engine/commands.ts`.

| Comando                                | Campos específicos                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHARACTER_CREATE`                     | `sheet` (contrato público completo, incluindo UUID), `kind`, `known`; opcionais `living`, `privateNotes`, `privateObjectives`, `personality`, `motivations`, `state` |
| `CHARACTER_EDIT` / `CHARACTER_REVEAL`  | Personagem + patch de perfil / motivo da revelação                                                                                                                   |
| `ABILITY_SET` / `RESOURCE_SET`         | Personagem, valores limitados, motivo; correções manuais auditadas                                                                                                   |
| `CONDITION_APPLY` / `CONDITION_REMOVE` | Anotação, visibilidade e motivo / ID e motivo. Caído automatizado usa a ação Levantar                                                                                |
| `ITEM_CREATE`                          | Nome/descrição/consumível, visibilidade; `equipmentRuleId` opcional (`heavy-blade`, `light-blade`, `longbow`)                                                        |
| `ITEM_GRANT`                           | Personagem, item, quantidade, motivo                                                                                                                                 |
| `INVENTORY_ACTION`                     | Personagem + `input` público (equipar/desequipar/consumir/transferir)                                                                                                |
| `METRIC_DEFINE` / `RELATIONSHIP_SET`   | Definição de intervalo / participantes, valor, motivo, visibilidade. Extensão SoloRPG                                                                                |
| `WORLD_UPSERT` / `EVENT_RECORD`        | Estado completo de entidade e motivo / acontecimento narrativo e participantes                                                                                       |
| `CHECK_PREPARE` / `CHECK_RESOLVE`      | Exemplo acima / ID do pedido básico                                                                                                                                  |
| `OPPOSED_PREPARE`                      | Dados de personagem/atributo/foco/modificador de cada lado; motivo e visibilidade                                                                                    |
| `ADVANCED_CREATE`                      | Personagem/atributo/foco, TN, `threshold`, `intervalMinutes`, motivo, visibilidade                                                                                   |
| `ADVANCED_PREPARE`                     | `advancedTestId`, elegibilidade a Stunts opcional                                                                                                                    |
| `SPECIAL_CHECK_RESOLVE`                | ID do pedido oposto/prolongado                                                                                                                                       |
| `COMBAT_CONFIGURE`                     | Personagem, `armorType`, `armorTrained`, `shieldType`, `shieldTrained`, `baseSpeed`, `weaponTraining`, motivo                                                        |
| `COMBAT_START`                         | `members` com personagem, arma do inventário, x/y e `usesDyingRules` opcional para NPC principal; visibilidade e motivo                                              |
| `COMBAT_ACTION`                        | `input` público com encontro/personagem/sessão, ação e alvo ou coordenadas quando necessário                                                                         |
| `COMBAT_RESOLVE`                       | `input` com sessão, ataque e lista de Stunts                                                                                                                         |
| `COMBAT_END`                           | Encontro, motivo                                                                                                                                                     |
| `ARCANA_CURE_PREPARE`                  | Personagem, alvo, `touchConfirmed:true`, motivo e visibilidade                                                                                                       |
| `ARCANA_CURE_RESOLVE`                  | ID do pedido de Curar                                                                                                                                                |
| `REST`                                 | Personagem, `kind:BREATHER` ou `SLEEP`, motivo                                                                                                                       |
| `ROLL`                                 | Nenhum campo adicional; requer sessão                                                                                                                                |

Para configurar confiança, por exemplo, `METRIC_DEFINE` pode usar nome `trust`, mínimo
–100 e máximo 100. Esses números são configuração SoloRPG, não valores Blue Rose.
As alterações são direcionais e não determinam o comportamento de personagens.

## Endpoints acrescentados pelo núcleo mecânico

Além das rotas de ficha, dados e mundo, sob `/api/v1`:

| Método | Rota                                       |
| ------ | ------------------------------------------ |
| GET    | `/campaigns/:id/blue-rose/combat`          |
| POST   | `/campaigns/:id/blue-rose/combat/actions`  |
| POST   | `/campaigns/:id/blue-rose/combat/stunts`   |
| GET    | `/campaigns/:id/blue-rose/arcana/requests` |
| POST   | `/campaigns/:id/blue-rose/arcana/cure`     |
| GET    | `/campaigns/:id/blue-rose/advanced-tests`  |

Não há POST público para iniciar/encerrar encontro, configurar perfis, criar NPC,
preparar testes, conceder itens ou corrigir recursos. Todas essas capacidades ficam
na ferramenta local. O catálogo `/blue-rose/stunts` descreve cinco efeitos suportados
e informa cobertura parcial; não simula que todos os Stunts do livro foram feitos.
