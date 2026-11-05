# Gloamhale v4 — Integridade narrativa

A revisão 4 aplica as correções de presença e revelação da [auditoria de localidades](gloamhale-location-audit.md) às campanhas novas. A prontidão para exploração livre continua **parcial**. A referência de cada campanha existente permanece vinculada à versão importada.

| Falha observada na auditoria | Causa | Correção na revisão 4 |
| --- | --- | --- |
| Chant podia responder enquanto desaparecida | A lista da cena marcava identidades como conhecidas e as oferecia ao interpretador como presentes. | A ativação de `losing-chant` registra ausência. Rever a cena anterior não restaura a presença. A descoberta confirmada na gruta registra a nova localização. |
| Erila aparecia por nome antes do contato. Eric e Bamala não tinham identificação individual condicionada. | A ativação revelava todo o elenco nomeado. | Identificação persiste separadamente da localização. Erila, Eric, Bamala e Jaymes exigem confirmação individual de revelação. A disponibilidade para diálogo é avaliada em separado. |
| Escritório, salão e quarto descreviam o resultado de uma descoberta | A descrição da referência era copiada para uma entidade pública na ativação. | A v4 descreve o perceptível. O catálogo do servidor disponibiliza apenas a descoberta específica confirmada. A dissipação do banquete muda a descrição pública em revisitas. |
| A opção SCENE podia enviar dados de Mestre ao modelo | O contexto do backend era encaminhado integralmente nesse ramo. | A chamada v4 mantém apenas a flag de adjudicação desse bloco. A abertura usada pelo backend deriva da referência v4 e das revelações registradas. |
| Uma substituição de texto no catálogo podia antecipar segredos | A alteração genérica de mundo podia editar a descrição pública de um local canônico. | O motor reserva a descrição, o nome e a divulgação dos locais canônicos v4 à referência e às operações de confirmação. O renderer continua validando a igualdade integral do fragmento. |

`CONFIRM_CAST_PRESENCE` é um comando local de sessão ativa. Ele recebe a
chave do indivíduo, `present`, `canSpeak`, `confirmedInPlay: true` e
uma justificativa. A localização é derivada da cena atual quando presente.
A projeção combina esse registro persistido com a presença inicial da
cena. Um indivíduo conhecido fora da cena pode continuar servindo de
referência à memória, sem se tornar um alvo de diálogo. Enit só tem
presença inicial em `harvest` se o desaparecimento ocorreu. O ritual
concluído mantém o banimento de Jaymes mesmo em revisitas.

`CONFIRM_REVELATION` recebe uma chave do catálogo, `confirmedInPlay: true`
e uma justificativa. O operador atesta que a ação ou o acontecimento
canônico ocorreu. O backend valida a versão, a sessão ativa, a cena de
origem, a presença quando exigida e se o fato já foi divulgado. O
conteúdo público é escolhido pelo servidor. A transação registra a
revelação pública, a memória de Naelis e um evento privado com a
proveniência e a justificativa. Se a revelação identificar alguém,
atualiza também a identidade conhecida. Identificar Erila e examinar o
espelho são operações independentes.

Os eventos ficam no armazenamento existente e são lidos por campanha.
O backend usa a mesma presença para selecionar interlocutores,
validar menções no contexto de diálogo, carregar vínculos de Story Card
e atribuir memórias de testemunhas. O ID derivado continua ligado à mesma
chave. A autorização de FREE resolve o alvo contra o elenco filtrado.
A presença registrada e o conhecimento sobrevivem a revisitas e à
retomada da sessão.

| Arquivos | Responsabilidade |
| --- | --- |
| `gloamhale-v4.ts`, `adventure-registry.module.ts`, `default-adventure.ts` | Referência e aberturas v4. Registro da nova versão e seleção para campanhas novas. |
| `narrative-integrity.ts`, `state.ts`, `adventure.service.ts`, `gloamhale-runtime.ts` | Catálogo de revelações, presença por evento, confirmações locais, ativação e efeito persistente do banimento. |
| `context.service.ts`, `narrative.service.ts`, `resolution.service.ts`, `mentions.ts`, `story-card-dialogue.ts` | Projeção, observação, autorização por elenco, menções e Story Cards. |
| `game-engine.service.ts` | Proteção da descrição canônica contra alteração genérica. |
| `test/integration/gloamhale.spec.ts`, `test/integration/phase55.spec.ts` | Regressões da v4 e da versão padrão para campanhas novas. |

O recorte cobre os fatos enumerados no catálogo. A confirmação de
investigações, possessão e demais acontecimentos condicionais ainda
depende de adjudicação local. A condição inicial de NPCs comuns vem da
cena preparada e transições posteriores dependem de confirmação.
Navegação, objetos interativos e investigação graduada seguem como
lacunas da auditoria. Os manifestos históricos continuam apontando para
as versões de código congeladas. Uma nova avaliação ao vivo requer seu
próprio manifesto compatível com a revisão.

## Verificação offline

Passaram **49 testes de integração** em Gloamhale, Story Cards e
continuidade de sessão, com PostgreSQL descartável e IA simulada.
Na revisão 4, os testes reproduziram a tentativa de diálogo com Chant
ausente usando seu ID previamente conhecido, verificaram a lista de
atores e o vínculo de Story Card antes e depois do reencontro e
confirmaram presença e memória após revisita e pausa/retomada. Também
verificaram a projeção SCENE sem dados privados, a recusa de revelação
fora da cena de origem, a recusa de uma descrição adulterada no
escritório, os estados do salão antes e depois da dissipação, o
espelho e a identificação separada de Erila, Eric e Bamala. No
NARRATE simulado, segredo não descoberto e galeria inventada receberam
`UNAPPROVED_SEGMENT`.

```sh
PATH="$PWD/.tools/node_modules/.bin:$PATH" node scripts/test-integration.mjs --runTestsByPath test/integration/gloamhale.spec.ts test/integration/story-card-dialogue.spec.ts test/integration/phase55.spec.ts
```

Também passaram **73 testes unitários** de publicação 5.6.2, Story
Cards e ações livres, incluindo a paridade Python/Zod da publicação.
A tipagem da API e o lint direcionado passaram.
